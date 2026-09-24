import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Finding, FlagDefinition, FlagReference, LinterConfig, LintOptions, Manifest } from './types.js';

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const DEFAULT_FLAG_FUNCTIONS = ['isEnabled', 'isFeatureEnabled', 'useFeatureFlag', 'useFlag', 'flagEnabled'];
const DEFAULT_CONFIG_PATH = '.feature-flag-linter.json';

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Heuristic, not AST-based: catches the common flag-check call shapes without
// needing a parser for every dialect of JS/TS a codebase might use.
function buildFlagCallPattern(functionNames: string[]): RegExp {
  const alternation = functionNames.join('|');
  return new RegExp(`\\b(?:${alternation})\\s*\\(\\s*['"]([a-zA-Z0-9_.-]+)['"]`, 'g');
}

export function loadConfig(configPath: string, isDefaultPath: boolean): LinterConfig {
  if (isDefaultPath && !existsSync(configPath)) {
    return {};
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    throw new Error(`could not read config file: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`config is not valid JSON: ${configPath}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`config must be a JSON object: ${configPath}`);
  }

  const { flagFunctions } = parsed as { flagFunctions?: unknown };
  if (flagFunctions === undefined) {
    return {};
  }
  if (!Array.isArray(flagFunctions) || !flagFunctions.every((name) => typeof name === 'string')) {
    throw new Error(`config "flagFunctions" must be an array of strings: ${configPath}`);
  }
  for (const name of flagFunctions) {
    if (!IDENTIFIER_PATTERN.test(name)) {
      throw new Error(`config "flagFunctions" entry is not a valid function name: ${name}`);
    }
  }

  return { flagFunctions };
}

function* walkFiles(root: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      yield fullPath;
    }
  }
}

function collectTargetFiles(target: string): string[] {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    return [...walkFiles(target)];
  }
  return [target];
}

function scanFileForFlags(filePath: string, pattern: RegExp): FlagReference[] {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const refs: FlagReference[] = [];
  lines.forEach((lineText, index) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
      refs.push({ flag: match[1], file: filePath, line: index + 1 });
    }
  });
  return refs;
}

export function loadManifest(manifestPath: string): { manifest: Manifest; raw: string } {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error(`could not read manifest file: ${manifestPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`manifest is not valid JSON: ${manifestPath}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { flags?: unknown }).flags)) {
    throw new Error(`manifest must be an object with a "flags" array: ${manifestPath}`);
  }

  const flags = (parsed as { flags: unknown[] }).flags.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { name?: unknown }).name !== 'string') {
      throw new Error(`manifest flags[${i}] is missing a "name" string`);
    }
    return entry as FlagDefinition;
  });

  return { manifest: { flags }, raw };
}

// The manifest is plain JSON, so we don't get parse positions back from
// JSON.parse. Re-scanning the raw text for the flag's quoted name is cheap
// and good enough to point someone at the right spot.
function findLineForFlagName(raw: string, name: string): number {
  const lines = raw.split('\n');
  const needle = `"${name}"`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return 1;
}

function isExpired(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const parsed = new Date(dateStr);
  return !isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

export function lint(options: LintOptions): Finding[] {
  const { manifest, raw } = loadManifest(options.manifestPath);
  const declared = new Map(manifest.flags.map((f) => [f.name, f]));

  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const config = loadConfig(configPath, options.configPath === undefined);
  const flagFunctions = [...DEFAULT_FLAG_FUNCTIONS, ...(config.flagFunctions ?? [])];
  const pattern = buildFlagCallPattern(flagFunctions);

  const references: FlagReference[] = [];
  for (const target of options.targets) {
    for (const file of collectTargetFiles(target)) {
      references.push(...scanFileForFlags(file, pattern));
    }
  }

  const referencedNames = new Set(references.map((r) => r.flag));
  const findings: Finding[] = [];

  for (const ref of references) {
    if (!declared.has(ref.flag)) {
      findings.push({
        severity: 'error',
        rule: 'undeclared-flag',
        message: `flag "${ref.flag}" is used in code but not declared in ${options.manifestPath}`,
        file: ref.file,
        line: ref.line,
      });
    }
  }

  for (const flag of manifest.flags) {
    const line = findLineForFlagName(raw, flag.name);
    if (!referencedNames.has(flag.name)) {
      findings.push({
        severity: 'warning',
        rule: 'unused-flag',
        message: `flag "${flag.name}" is declared but never referenced in the scanned code`,
        file: options.manifestPath,
        line,
      });
    } else if (isExpired(flag.expires)) {
      findings.push({
        severity: 'warning',
        rule: 'expired-flag',
        message: `flag "${flag.name}" expired on ${flag.expires} but is still referenced in code`,
        file: options.manifestPath,
        line,
      });
    }
  }

  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return findings;
}
