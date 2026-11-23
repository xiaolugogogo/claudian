import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Reader for ZCode's personal provider configuration
 * (`~/.zcode/v2/provider_config.json`): the single source of truth for which
 * providers and models the ZCode CLI can run. ZCode has no `--model` flag, so
 * per-conversation model selection is applied by deriving a temporary config
 * file that pins `defaultModelSelection` and `providerOrder`.
 *
 * External selection ids use the provider NAME (`zcode:<name>/<modelId>`,
 * matching the other providers' upstream/model shape); the provider's internal
 * uuid is resolved from the config only when a turn is launched.
 */
export interface ZcodeCatalogEntry {
  /** External selection id: `zcode:<providerName>/<modelId>`. */
  readonly id: string;
  /** Display name: the bare model id (the provider shows as the group). */
  readonly name: string;
  readonly providerLabel: string;
  /** ZCode's internal provider id (uuid) used in derived config files. */
  readonly providerId: string;
  readonly modelId: string;
}

export interface ZcodeModelSelection {
  /** Provider as addressed by the selection id: usually the provider name. */
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

export function readZcodePersonalConfig(path: string): Record<string, unknown> | null {
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
      id: `${ZCODE_MODEL_ID_PREFIX}${sanitizeProviderLabel(providerLabel)}/${modelId}`,
      name: modelId,
      providerLabel,
      providerId,
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
 * Resolves a selection's provider to ZCode's internal uuid. Selection ids
 * address providers by name; a raw uuid also resolves, keeping earlier
 * selections alive across the id-format change.
 */
export function resolveZcodeSelectionToProviderId(
  selection: ZcodeModelSelection,
  catalog: readonly ZcodeCatalogEntry[],
): string | null {
  const byName = catalog.find(entry => entry.providerLabel === selection.providerId);
  if (byName) return byName.providerId;
  const byUuid = catalog.find(entry => entry.providerId === selection.providerId && entry.modelId === selection.modelId);
  return byUuid?.providerId ?? null;
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

/** Provider labels become id segments; a slash inside a name must not break parsing. */
function sanitizeProviderLabel(label: string): string {
  return label.replaceAll('/', '-');
}

/**
 * Migrates selection ids written by earlier builds: uuid-addressed ids
 * (`zcode:<uuid>/<modelId>`) resolve through the catalog to the current
 * name-addressed format. Unknown ids pass through untouched.
 */
export function migrateZcodeSelectionIds(
  ids: readonly string[],
  catalog: readonly ZcodeCatalogEntry[],
): string[] {
  return ids.map(id => {
    if (catalog.some(entry => entry.id === id)) return id;
    const separator = id.indexOf('/');
    if (!id.startsWith(ZCODE_MODEL_ID_PREFIX) || separator <= 0) return id;
    const providerId = id.slice(ZCODE_MODEL_ID_PREFIX.length, separator);
    const modelId = id.slice(separator + 1);
    const match = catalog.find(entry => entry.providerId === providerId && entry.modelId === modelId);
    return match ? match.id : id;
  });
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
