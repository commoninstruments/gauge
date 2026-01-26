# Claude Usage Dashboard

CLI to check Claude usage across multiple accounts.

## Features
- Add multiple Claude accounts (saved locally)
- Fetch usage from Claude API and display a simple dashboard
- Recommend the next best account to use

## Requirements
- Node.js 18+
- Chrome installed (Playwright uses your local Chrome)

## Install
```bash
npm install
```

## Build
```bash
npm run build
```

## Usage
```bash
# Add an account (opens Chrome for login)
node dist/cli.js add <name>

# Refresh an account session
node dist/cli.js refresh <name>

# List accounts
node dist/cli.js list

# Show dashboard
node dist/cli.js

# Quick recommendation only
node dist/cli.js --quick
```

## Notes
- Account sessions are stored locally in `accounts/` (ignored by git).
- If Cloudflare blocks a session, re-run `refresh` for that account.

## License
MIT
