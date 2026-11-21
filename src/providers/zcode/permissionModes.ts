/**
 * Maps Claudian's permission-mode selection to the ZCode CLI `--mode` values.
 *
 * ZCode headless has no interactive approval client: in `build`/`guarded`
 * modes an `ask` decision fails the tool ("No permission client configured").
 * Only `plan` (analysis-only), `edit` (file edits auto-approved) and `yolo`
 * (everything auto-approved) produce working turns, so Claudian offers those
 * three; the fail-closed default keeps writes gated until the user opts in.
 */
export const ZCODE_PERMISSION_MODES = ['plan', 'edit', 'yolo'] as const;

export type ZcodePermissionMode = (typeof ZCODE_PERMISSION_MODES)[number];

export const ZCODE_PERMISSION_MODE_POLICY = {
  values: [...ZCODE_PERMISSION_MODES],
  fallbackValue: 'plan',
  defaultValue: 'yolo',
} as const;

export function resolveZcodePermissionMode(value: string | undefined): ZcodePermissionMode {
  if (value === 'plan' || value === 'edit' || value === 'yolo') return value;
  return 'plan';
}
