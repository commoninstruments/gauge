# gauge

Agent-first CLI to check AI usage across multiple accounts.

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
npx @howells/gauge@latest
```

```bash
npm install -g @howells/gauge
gauge
```

## Human Usage

```bash
gauge
gauge --quick
gauge list
gauge add personal
gauge refresh personal
gauge remove personal --dry-run
```

## Agent Usage

Inspect the runtime schema first:

```bash
gauge describe --format json
```

Use structured output with field masks:

```bash
gauge status --format json \
  --fields recommendation.account.name,accounts.name
```

Stream paginated reads as NDJSON:

```bash
gauge list --format ndjson --page-size 1 --page-all
```

Pass raw payloads directly:

```bash
gauge add --json '{"name":"personal","storage_state_file":"./state.json"}' --format json
gauge refresh --input-file payload.json --dry-run --format json
```

Write output to a sandboxed file inside the current working directory:

```bash
gauge describe --format json --output-file ./artifacts/gauge-schema.json
```

## Headless Auth

Import Playwright storage state without opening Chrome:

```bash
gauge add --json '{"name":"personal","storage_state_file":"./state.json"}'
```

You can also use environment variables. The old `CLAUDEUSAGE_*` names are
still accepted as fallbacks for existing automation.

```bash
export GAUGE_STORAGE_STATE_FILE=./state.json
gauge add personal --format json
```

```bash
export GAUGE_STORAGE_STATE_JSON='{"cookies":[],"origins":[]}'
gauge refresh personal --dry-run --format json
```

## Safety Posture

- The agent is not a trusted operator.
- Use `--dry-run` before mutating commands.
- Use `--fields` on read commands to control context size.
- Use `describe` instead of scraping `--help`.
- Output files must stay inside the current working directory.
- Structured output is sanitized by default. Disable with `--no-sanitize` only if you have a trusted downstream consumer.

## Local Data

- Account data is stored in `~/.gauge/`
- Browser auth stores Playwright storage state in the same directory
- Local files are written with restrictive permissions where supported

## Agent Knowledge

- [AGENTS.md](./AGENTS.md)
- [skills/README.md](./skills/README.md)

## License

MIT
