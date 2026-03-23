# claudeusage

Agent-first CLI to check Claude usage across multiple accounts.

## Features

- Human dashboard in TTY mode
- Structured JSON by default in non-TTY mode
- NDJSON streaming for paginated reads
- Raw JSON payloads for all mutating commands
- Runtime schema introspection with `describe`
- Field masks with `--fields`
- `--dry-run` for all mutating commands
- Headless auth via Playwright storage-state import
- Output path sandboxing to the current working directory

## Requirements

- Node.js 18+
- Chrome installed for browser-based auth

## Install

```bash
npx @howells/claudeusage@latest
```

```bash
npm install -g @howells/claudeusage
claudeusage
```

## Human Usage

```bash
claudeusage
claudeusage --quick
claudeusage list
claudeusage add personal
claudeusage refresh personal
claudeusage remove personal --dry-run
```

## Agent Usage

Inspect the runtime schema first:

```bash
claudeusage describe --format json
```

Use structured output with field masks:

```bash
claudeusage status --format json \
  --fields recommendation.account.name,summary.available_accounts
```

Stream paginated reads as NDJSON:

```bash
claudeusage list --format ndjson --page-size 1 --page-all
```

Pass raw payloads directly:

```bash
claudeusage add --json '{"name":"personal","storage_state_file":"./state.json"}' --format json
claudeusage refresh --input-file payload.json --dry-run --format json
```

Write output to a sandboxed file inside the current working directory:

```bash
claudeusage describe --format json --output-file ./artifacts/claudeusage-schema.json
```

## Headless Auth

Import Playwright storage state without opening Chrome:

```bash
claudeusage add --json '{"name":"personal","storage_state_file":"./state.json"}'
```

You can also use environment variables:

```bash
export CLAUDEUSAGE_STORAGE_STATE_FILE=./state.json
claudeusage add personal --format json
```

```bash
export CLAUDEUSAGE_STORAGE_STATE_JSON='{"cookies":[],"origins":[]}'
claudeusage refresh personal --dry-run --format json
```

## Safety Posture

- The agent is not a trusted operator.
- Use `--dry-run` before mutating commands.
- Use `--fields` on read commands to control context size.
- Use `describe` instead of scraping `--help`.
- Output files must stay inside the current working directory.
- Structured output is sanitized by default. Disable with `--no-sanitize` only if you have a trusted downstream consumer.

## Local Data

- Account data is stored in `~/.claudeusage/`
- Browser auth stores Playwright storage state in the same directory
- Local files are written with restrictive permissions where supported

## Agent Knowledge

- [AGENTS.md](./AGENTS.md)
- [skills/README.md](./skills/README.md)

## License

MIT
