# Web Console

The Runlane Web Console is the browser workspace for operating workflows, executions, integrations, usage, plans and audit records.

## Local endpoints

The Vite workspace in `apps/web` serves local development and preview on loopback port `4610`:

```powershell
pnpm dev:web
pnpm preview:web
```

The local API stays on `http://localhost:4600`. The web client reads `VITE_RUNLANE_API_URL` when it is provided and otherwise falls back to `http://127.0.0.1:4600`.

## Routes

The current console routes are intentionally compact:

- `/overview` — workspace health, recent activity and quick actions
- `/builder` — workflow list, workflow draft editor and step canvas
- `/runs` — execution history, selected run details and retry actions
- `/integrations` — API keys, workflow secrets and connector credentials
- `/usage` — usage counters and limits
- `/plans` — plan comparison and billing actions
- `/audit` — audit log table and operational events

The root path redirects into the active console route. The container image uses a Caddy fallback so direct browser refreshes on these routes return `index.html`.

## Design priorities

The console is optimized for workflow operators. It uses dense tables, status chips, JSON panels, draggable workflow blocks, copy actions and trace-style execution details so workspace activity can be inspected without switching to separate tools.

## Brand and install assets

The web workspace owns its deployable browser assets under `apps/web/public`:

```txt
favicon.svg
favicon.ico
apple-touch-icon.png
manifest.webmanifest
brand/mark.svg
icons/icon-192.png
icons/icon-512.png
```

The manifest uses `Runlane Console` as the app name and includes 192px and 512px PNG icons for browser install surfaces.

## Runtime commands

```powershell
pnpm dev:web
pnpm build:web
pnpm preview:web
pnpm typecheck:web
pnpm validate:web
```
