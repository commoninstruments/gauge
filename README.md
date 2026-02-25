# Claude Status Dashboard

CLI to check Claude usage across multiple accounts.

## Features
- Add multiple Claude accounts (saved locally)
- Fetch usage from Claude API and display a simple dashboard
- Recommend the next best account to use

## Requirements
- Node.js 18+
- Chrome installed (Playwright uses your local Chrome)

## Usage
```bash
# One-off (after publish)
npx @howells/claudeusage@latest

# Or install globally
npm install -g @howells/claudeusage
claudeusage

# Add an account (opens Chrome for login)
claudeusage add <name>

# Refresh an account session
claudeusage refresh <name>

# List accounts
claudeusage list

# Show dashboard
claudeusage

# Quick recommendation only
claudeusage --quick
```

## Notes
- Account data is stored in `~/.claudeusage/` (persists across reinstalls).
- Uses `playwright-core` — no bundled browser download; requires Chrome installed on your system.
- If Cloudflare blocks a session, re-run `refresh` for that account.

## License
MIT
