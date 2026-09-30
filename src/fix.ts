import { readFileSync, writeFileSync } from 'node:fs';
import type { Finding } from './types.js';

export interface FixResult {
  removed: string[];
  // Set when unused flags were found but left alone, with the reason.
  skippedReason?: string;
}

// A flag only counts as confirmed unused if nothing in the scan could be
// reaching it through a computed name. One dynamic call anywhere means any
// declared flag might be the one it resolves to, so nothing gets removed.
export function findRemovableFlags(findings: Finding[]): FixResult {
  const unused = findings
    .filter((f) => f.rule === 'unused-flag' && f.flag !== undefined)
    .map((f) => f.flag as string);
  if (unused.length === 0) return { removed: [] };

  if (findings.some((f) => f.rule === 'dynamic-flag')) {
    return {
      removed: [],
      skippedReason: 'dynamic flag checks were found, so no unused flag can be confirmed as unused',
    };
  }
  return { removed: [...new Set(unused)] };
}

export function removeFlagsFromManifest(manifestPath: string, names: string[]): void {
  if (names.length === 0) return;

  const raw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as { flags: { name: string }[] };
  const doomed = new Set(names);
  manifest.flags = manifest.flags.filter((flag) => !doomed.has(flag.name));

  // Keep the file's existing indentation so the diff is just the removed entries.
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? '  ';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, indent) + '\n');
}
