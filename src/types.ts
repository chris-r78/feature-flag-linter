export interface FlagDefinition {
  name: string;
  owner?: string;
  expires?: string;
  description?: string;
}

export interface Manifest {
  flags: FlagDefinition[];
}

export interface FlagReference {
  flag: string;
  file: string;
  line: number;
}

// A flag-check call whose first argument isn't a plain quoted string, e.g.
// `useFlag(getFlagName())` or `isEnabled(isDebug ? 'a' : 'b')`. We can't
// resolve the flag name against the manifest, so these are tracked
// separately instead of being silently dropped from the scan.
export interface DynamicFlagReference {
  func: string;
  argText: string;
  file: string;
  line: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  file: string;
  line: number;
}

export interface LintOptions {
  targets: string[];
  manifestPath: string;
  configPath?: string;
}

export interface LinterConfig {
  // Additional function names (beyond the built-in ones) whose first string
  // argument should be treated as a flag reference, e.g. wrappers like
  // `myCompanyFlag(...)` around the real flag-check call.
  flagFunctions?: string[];
}
