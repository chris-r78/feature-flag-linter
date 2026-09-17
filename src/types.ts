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

export type Severity = 'error' | 'warning';

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
}
