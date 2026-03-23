---
name: claudeusage-mutations
description: Mutate local claudeusage state with dry-run, raw JSON payloads, and structured responses.
version: 1
---

# claudeusage mutations

## Rules

- Always run mutating commands with `--dry-run` first.
- Prefer `--json` or `--input-file -` over positional argument construction in automation.
- Keep payloads aligned with `claudeusage describe --format json`.
- Keep any `--output-file` path inside the current working directory.

## Examples

```bash
claudeusage add --json '{"name":"personal","storage_state_file":"./state.json"}' --dry-run --format json
```

```bash
claudeusage remove --json '{"name":"personal"}' --format json
```
