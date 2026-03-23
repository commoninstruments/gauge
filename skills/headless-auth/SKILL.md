---
name: claudeusage-headless-auth
description: Authenticate claudeusage without launching Chrome by importing Playwright storage-state data.
version: 1
---

# claudeusage headless auth

## Rules

- Prefer `storage_state_file` for larger payloads.
- Use `storage_state_json` only for small inline payloads.
- In automation, prefer `CLAUDEUSAGE_STORAGE_STATE_FILE` or `CLAUDEUSAGE_STORAGE_STATE_JSON`.
- Validate first with `--dry-run`.

## Examples

```bash
export CLAUDEUSAGE_STORAGE_STATE_FILE=./state.json
claudeusage add personal --dry-run --format json
```

```bash
claudeusage refresh --json '{"name":"personal","storage_state_file":"./state.json"}' --format json
```
