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
npx claudestatus@latest

# Or install globally
npm install -g claudestatus
claudestatus

# Add an account (opens Chrome for login)
claudestatus add <name>

# Refresh an account session
claudestatus refresh <name>

# List accounts
claudestatus list

# Show dashboard
claudestatus

# Quick recommendation only
claudestatus --quick
```

## Notes
- Account sessions are stored locally in `accounts/` (ignored by git).
- If Cloudflare blocks a session, re-run `refresh` for that account.

## License
MIT
