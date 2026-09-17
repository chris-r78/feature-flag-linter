# feature-flag-linter

Feature flags rot. Someone typos a flag name in a `useFeatureFlag()` call and
it silently never turns on. Someone declares a flag in the config, ships the
code path, and forgets to delete the flag from config six months later.
Someone sets an expiration date on a flag and nobody actually removes the
check when that date passes. None of this shows up as a compile error or a
failing test - the code runs fine either way.

This is a small linter that catches those three cases by comparing the flags
referenced in your code against a manifest file that lists the flags you
actually meant to have:

- **undeclared-flag** - code calls a flag that isn't in the manifest (likely a
  typo, or a flag that was removed from config but not from the code)
- **unused-flag** - the manifest declares a flag that no code references
  anymore (a candidate for cleanup)
- **expired-flag** - the manifest's `expires` date for a flag is in the past,
  but the flag is still checked in code

Findings are reported with the file and line number where the problem lives,
either as plain text or as JSON for wiring into other tooling.

## How it works

The manifest is a JSON file, `feature-flags.json` by default:

```json
{
  "flags": [
    {
      "name": "new-checkout-flow",
      "owner": "payments-team",
      "expires": "2026-01-01",
      "description": "Gates the redesigned checkout flow"
    }
  ]
}
```

The linter scans your source files for calls that look like flag checks -
`isEnabled(...)`, `isFeatureEnabled(...)`, `useFeatureFlag(...)`,
`useFlag(...)`, `flagEnabled(...)` - with a string literal as the flag name,
and cross-references the names it finds against the manifest.

This is a regex-based scan over source text, not a full parser. It will miss
flag names built from variables or template strings, and it only recognizes
the call names listed above. See the roadmap below for where this is headed.

## Usage

Build once:

```
npx tsc
```

Then run it against a project:

```
node dist/cli.js src/
```

Human-readable output:

```
src/checkout/router.ts:42  error    undeclared-flag  flag "new-checkot-flow" is used in code but not declared in feature-flags.json
feature-flags.json:9       warning  unused-flag      flag "legacy-search" is declared but never referenced in the scanned code
feature-flags.json:14      warning  expired-flag     flag "new-checkout-flow" expired on 2026-01-01 but is still referenced in code

1 error(s), 2 warning(s)
```

The same run with `--json`:

```
node dist/cli.js src/ --json
```

```json
{
  "findings": [
    {
      "severity": "error",
      "rule": "undeclared-flag",
      "message": "flag \"new-checkot-flow\" is used in code but not declared in feature-flags.json",
      "file": "src/checkout/router.ts",
      "line": 42
    }
  ],
  "errorCount": 1,
  "warningCount": 2
}
```

The process exits with code `1` if any error-level finding was reported, `0`
otherwise, so it can be dropped into CI as-is.

Other flags:

```
node dist/cli.js --manifest config/flags.json src/ tools/
node dist/cli.js --help
```

## Status

This is a first pass. No third-party dependencies - it only uses Node's
standard library.

## Roadmap

- Parse source with the TypeScript compiler API instead of regex, to catch
  flag names built from constants and to stop matching false positives inside
  comments and strings
- Support a config file for custom flag-check function names
- Detect flags referenced with dynamic/computed names and report them as a
  separate "cannot verify" category instead of silently skipping them
- Add a `--fix` mode that removes manifest entries for confirmed unused flags
- Publish as an npm package with a proper CLI entry point
