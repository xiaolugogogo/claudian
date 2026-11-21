import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Reader for ZCode's personal provider configuration
 * (`~/.zcode/v2/provider_config.json`): the single source of truth for which
 * providers and models the ZCode CLI can run. ZCode has no `--model` flag, so
 * per-conversation model selection is applied by deriving a temporary config
 * file that pins `defaultModelSelection` and `providerOrder`.
 */
export interface ZcodeCatalogEntry {
  /** Selection id handed to Claudian: `zcode:<providerId>/<modelId>`. */
  readonly id: string;
  /** Display label: alias wins, else `<providerName> <modelId>`. */
  readonly name: string;
  readonly providerLabel: string;
  readonly modelId: string;
}

export interface ZcodeModelSelection {
  readonly providerId: string;
  readonly modelId: string;
}

export const ZCODE_MODEL_ID_PREFIX = 'zcode:';

/** Resolves the personal config path exactly like the ZCode CLI does. */
export function resolveZcodePersonalConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE?.trim();
  if (explicit) return explicit;
  const dataBaseDir = env.ZCODE_DATA_BASE_DIR?.trim() || homedir();
  return join(dataBaseDir, '.zcode', 'v2', 'provider_config.json');
}

export function readZcodePersonalConfig(
  path: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parses the catalog entries from a personal config document. */
export function parseZcodeCatalog(config: Record<string, unknown>): ZcodeCatalogEntry[] {
  const providerNames = new Map<string, string>();
  const configRoot = asRecord(config.config);
  for (const rule of readRuleArray(configRoot, 'providerConfigRules', 'providerRules')) {
    const providerId = readString(rule.providerId);
    if (!providerId) continue;
    const name = readString(rule.providerName) || providerId;
    providerNames.set(providerId, name);
  }
  const entries: ZcodeCatalogEntry[] = [];
  for (const rule of readRuleArray(configRoot, 'modelConfigRules', 'providerModelRules')) {
    const providerId = readString(rule.providerId);
    const modelId = readString(rule.modelId);
    if (!providerId || !modelId) continue;
    const providerLabel = providerNames.get(providerId) ?? providerId;
    entries.push({
      id: `${ZCODE_MODEL_ID_PREFIX}${providerId}/${modelId}`,
      name: `${providerLabel} ${modelId}`,
      providerLabel,
      modelId,
    });
  }
  return entries;
}

/** Live catalog read; used by the shared picker and the chat model policy. */
export function listZcodeCatalogModels(env?: NodeJS.ProcessEnv): ZcodeCatalogEntry[] {
  return parseZcodeCatalog(readZcodePersonalConfig(resolveZcodePersonalConfigPath(env)) ?? {});
}

/**
 * Builds the derived personal config document for one turn: the user's real
 * config with `defaultModelSelection` pinned and the selected provider moved
 * to the front of `providerOrder` (the order drives the CLI's fallback).
 */
export function deriveZcodePersonalConfig(
  config: Record<string, unknown>,
  selection: ZcodeModelSelection,
): Record<string, unknown> {
  const derived = structuredClone(config);
  const configRoot = asRecord(derived.config);
  if (!configRoot) return derived;
  configRoot.defaultModelSelection = {
    providerId: selection.providerId,
    modelId: selection.modelId,
  };
  const order = Array.isArray(configRoot.providerOrder)
    ? configRoot.providerOrder.filter((entry): entry is string => typeof entry === 'string' && entry !== selection.providerId)
    : [];
  configRoot.providerOrder = [selection.providerId, ...order];
  return derived;
}

function readRuleArray(
  root: Record<string, unknown> | null | undefined,
  holderKey: string,
  listKey: string,
): Record<string, unknown>[] {
  const holder = asRecord(root?.[holderKey]);
  const list = holder?.[listKey];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
