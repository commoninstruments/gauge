---
name: gauge-status
description: Read Claude account usage safely with structured output, field masks, and paginated NDJSON.
version: 1
---

# gauge status

## Rules

- Always call `gauge describe --format json` first if you have not seen this version before.
- Prefer `--format json` for single-page reads.
- Prefer `--format ndjson --page-all` for large result sets.
- Always add `--fields` unless you need the full response.

## Examples

```bash
gauge status --format json --fields recommendation.account.name,accounts.name
```

```bash
gauge list --format ndjson --page-size 1 --page-all --fields accounts.name
```
