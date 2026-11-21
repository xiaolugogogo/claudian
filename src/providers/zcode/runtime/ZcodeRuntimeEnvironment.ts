import { dirname } from 'node:path';

import { getInstallationKey } from '@/core/device/InstallationKey';
import { getEnhancedPath, parseEnvironmentVariables } from '@/core/process/env';

import { createCLIPathFingerprintInputs } from '../../../core/providers/cli/CLIPathFingerprintInputs';
import { createRuntimeInputFingerprint } from '../../../core/providers/settings/RuntimeInputFingerprint';
import type { ZcodeProviderSettings } from '../config';

export function buildZcodeRuntimeEnv(
  environmentText: string,
  cliPath: string,
): NodeJS.ProcessEnv {
  const configuredEnvironment = parseEnvironmentVariables(environmentText);
  return {
    ...process.env,
    ...configuredEnvironment,
    PATH: getEnhancedPath(configuredEnvironment.PATH, cliPath ? dirname(cliPath) : undefined),
  };
}

/**
 * Fingerprint of ZCode's runtime inputs: the CLI path for this installation
 * and the environment. ZCode spawns per turn, so a changed fingerprint does
 * not restart a shared runtime; it only re-resolves the launch spec.
 */
export function computeZcodeRuntimeInputHash(
  settings: Pick<ZcodeProviderSettings, 'cliPath' | 'cliPathsByHost'>,
  environmentText: string,
): string {
  const cliPathInputs = createCLIPathFingerprintInputs(
    settings.cliPathsByHost[getInstallationKey()],
    settings.cliPath,
  );
  const environment = Object.entries(parseEnvironmentVariables(environmentText))
    .sort(([left], [right]) => left.localeCompare(right));
  return createRuntimeInputFingerprint({
    additionalInputs: { ...cliPathInputs },
    environmentKeys: environment.map(([key]) => key),
    environmentText,
  });
}
