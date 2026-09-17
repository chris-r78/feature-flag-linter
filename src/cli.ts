#!/usr/bin/env node
import { lint } from './lint.js';
import type { Finding } from './types.js';

const USAGE = `usage: feature-flag-linter [paths...] [--manifest <file>] [--json]

  paths          files or directories to scan (default: .)
  --manifest     path to the flags manifest (default: feature-flags.json)
  --json         emit findings as JSON instead of human-readable text
  --help         show this message
`;

interface ParsedArgs {
  targets: string[];
  manifestPath: string;
  jsonOutput: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const targets: string[] = [];
  let manifestPath = 'feature-flags.json';
  let jsonOutput = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--manifest') {
      i += 1;
      const value = argv[i];
      if (!value) throw new Error('--manifest requires a path argument');
      manifestPath = value;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      targets.push(arg);
    }
  }

  if (targets.length === 0) targets.push('.');
  return { targets, manifestPath, jsonOutput };
}

function printHuman(findings: Finding[]): void {
  if (findings.length === 0) {
    console.log('no findings');
    return;
  }
  for (const f of findings) {
    console.log(`${f.file}:${f.line}  ${f.severity.padEnd(7)}  ${f.rule}  ${f.message}`);
  }
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.length - errorCount;
  console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
}

function printJson(findings: Finding[]): void {
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.length - errorCount;
  console.log(JSON.stringify({ findings, errorCount, warningCount }, null, 2));
}

function main(): void {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`feature-flag-linter: ${(err as Error).message}\n`);
    process.exit(2);
  }

  let findings: Finding[];
  try {
    findings = lint({ targets: args.targets, manifestPath: args.manifestPath });
  } catch (err) {
    process.stderr.write(`feature-flag-linter: ${(err as Error).message}\n`);
    process.exit(2);
  }

  if (args.jsonOutput) {
    printJson(findings);
  } else {
    printHuman(findings);
  }

  const hasErrors = findings.some((f) => f.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();
