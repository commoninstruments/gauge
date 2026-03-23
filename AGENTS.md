# claudeusage Agent Guide

Use `claudeusage describe --format json` before invoking the CLI programmatically.

## Guardrails

- Treat this CLI as agent-first, not human-first.
- Prefer `--format json` or `--format ndjson`.
- In non-TTY mode, structured JSON is already the default.
- Use `--fields` on every read command unless you explicitly need the full payload.
- Use `--dry-run` on every mutating command before the real invocation.
- Prefer `--json` or `--input-file -` for mutating commands so your payload maps directly to the command schema.
- Prefer headless auth via `storage_state_file`, `storage_state_json`, `CLAUDEUSAGE_STORAGE_STATE_FILE`, or `CLAUDEUSAGE_STORAGE_STATE_JSON` in automation.
- Keep `--output-file` paths inside the current working directory.
- Structured output is sanitized by default. Only opt out with `--no-sanitize` if the downstream consumer is trusted.

## Recommended Sequence

1. `claudeusage describe --format json`
2. `claudeusage <read-command> --format json --fields ...`
3. `claudeusage <mutating-command> --dry-run --format json`
4. `claudeusage <mutating-command> --format json`

## Preferred Commands

- `claudeusage status`
- `claudeusage list`
- `claudeusage describe`
- `claudeusage add`
- `claudeusage refresh`
- `claudeusage remove`
