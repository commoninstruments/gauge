---
name: gauge-headless-auth
description: Authenticate gauge without launching Chrome by importing Playwright storage-state data.
version: 1
---

# gauge headless auth

## Rules

- Prefer `storage_state_file` for larger payloads.
- Use `storage_state_json` only for small inline payloads.
- In automation, prefer `GAUGE_STORAGE_STATE_FILE` or `GAUGE_STORAGE_STATE_JSON`.
- Validate first with `--dry-run`.

## Examples

```bash
export GAUGE_STORAGE_STATE_FILE=./state.json
gauge add personal --dry-run --format json
```

```bash
gauge refresh --json '{"name":"personal","storage_state_file":"./state.json"}' --format json
```
