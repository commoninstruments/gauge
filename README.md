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
- Codex usage reads the Codex CLI auth file from `~/.codex/auth.json` or `$CODEX_HOME/auth.json`
- Cursor usage needs a Cursor cookie or Playwright storage state provided through environment variables

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
gauge add codex work --codex-home ~/.codex-work
gauge add cursor work --storage-state-file ./cursor-state.json
gauge refresh codex work --renews-at 2026-07-12 --dry-run
gauge refresh personal
gauge refresh cursor work --storage-state-file ./cursor-state.json
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
gauge add --json '{"provider":"cursor","name":"work","storage_state_file":"./cursor-state.json"}' --format json
gauge add --json '{"provider":"codex","name":"work","codex_home":"./codex-home"}' --format json
gauge refresh --json '{"provider":"codex","name":"work","renews_at":"2026-07-12"}' --dry-run --format json
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

You can also use environment variables.

```bash
export GAUGE_STORAGE_STATE_FILE=./state.json
gauge add personal --format json
```

```bash
export GAUGE_STORAGE_STATE_JSON='{"cookies":[],"origins":[]}'
gauge refresh personal --dry-run --format json
```

### Cursor Auth

Cursor usage can be read from a named account with a Playwright storage state
that contains `cursor.com` cookies:

```bash
gauge add cursor work --storage-state-file ./cursor-state.json
gauge status --format json
```

For ambient, non-configured Cursor usage, you can also provide a cookie header
or storage state through environment variables:

```bash
export GAUGE_CURSOR_COOKIE='WorkosCursorSessionToken=...'
gauge status --format json
```

```bash
export GAUGE_CURSOR_STORAGE_STATE_FILE=./cursor-state.json
gauge status --format json
```

Supported environment variables:

- `GAUGE_CURSOR_COOKIE`
- `GAUGE_CURSOR_COOKIE_FILE`
- `GAUGE_CURSOR_STORAGE_STATE_FILE`
- `GAUGE_CURSOR_STORAGE_STATE_JSON`

## Subscription Renewals

Gauge reads Claude renewal dates from Claude's authenticated subscription
details endpoint when it is available. Cursor renewal dates come from Cursor's
usage summary. Codex's CLI token currently exposes usage but not ChatGPT billing,
so store a manual renewal date when needed:

```bash
gauge refresh codex work --renews-at 2026-07-12 --dry-run --format json
gauge refresh codex work --renews-at 2026-07-12 --format json
```

Clear a manual renewal date with:

```bash
gauge refresh codex work --renews-at none --format json
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
