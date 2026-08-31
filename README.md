# PreachSync

PreachSync is an offline-first, local-network church presentation remote.

One server on the presentation PC serves both the Host UI and Controller UI
and owns the authoritative Socket.IO presentation state.

## Quick start

Requirements: Node.js 20+, npm.

```bash
npm install
npm run dev
```

Then open:

| URL | Purpose |
|-----|---------|
| `http://localhost:4000/` | Presentation host (connect to this on the PC) |
| `http://localhost:4000/controller` | Remote controller (open on phone) |

On the host screen, use **Upload PowerPoint** to load a `.pptx` file. Only the
host browser receives the upload token; the controller cannot upload.

Slide images are rendered with:

1. Microsoft PowerPoint on Windows (local host PC)
2. LibreOffice + `pdftoppm` on Linux (Render Docker image)
3. Embedded pictures from the `.pptx` file if neither is available

Old `.ppt` files are not supported.

## Use from a phone on the same Wi-Fi

1. Find the PC's LAN IP address:

   ```powershell
   ipconfig
   ```

   Look under **Wireless LAN adapter Wi-Fi** → **IPv4 Address**
   (e.g. `192.168.1.11`).

2. Open on the phone's browser:

   ```
   http://192.168.1.11:4000/controller
   ```

   The controller automatically connects to the same origin — no environment
   variable configuration needed.

3. **Windows Firewall**: Windows may prompt to allow Node.js on private
   networks when the server first starts. Click **Allow**. If it doesn't
   prompt, add a rule manually (run PowerShell as Administrator):

   ```powershell
   New-NetFirewallRule `
     -DisplayName "PreachSync" `
     -Direction Inbound `
     -Action Allow `
     -Protocol TCP `
     -LocalPort 4000 `
     -Profile Private
   ```

## Available commands

```bash
npm run dev        # Start development server (hot-reload)
npm run build      # Build for production
npm run start      # Start production server (run build first)
npm run test       # Run all tests
npm run typecheck  # TypeScript checks
npm run lint       # ESLint
```

## Architecture

```
PreachSync :4000
    ├── HTTP (Next.js App Router)
    │    ├── /            → Host presentation
    │    ├── /host        → Redirects to /
    │    └── /controller  → Mobile controller
    │
    └── Socket.IO
          ├── Owns authoritative presentation state
          ├── Handles controller commands
          └── Broadcasts state to all connected clients
```

All Socket.IO connections use the browser's current origin — no manual IP
configuration required for normal LAN use.

## Environment variables

Copy `apps/host/.env.example` to `apps/host/.env.local` to override defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port. Render sets this automatically. |
| `HOST` | `0.0.0.0` | Network interface to bind to |

## Deploy on Render

A native Node service on Render cannot use Windows PowerPoint, so designed
slides will not look the same as on your laptop. Use the Docker runtime so
LibreOffice can export each slide as an image.

In the Render dashboard:

1. New → Web Service
2. Connect this repository
3. Runtime: **Docker**
4. Instance: **Starter** or larger (LibreOffice needs more than 512 MB)
5. Leave `PORT` to Render. Set `HOST=0.0.0.0` if you add it yourself.

Or apply `render.yaml` from the repo root.

Do not use the Node runtime with `npm start` alone if you need designed
PowerPoint slides. That path has no PowerPoint and no LibreOffice.

## Keyboard shortcuts (Host)

| Key | Action |
|-----|--------|
| Arrow Right, Page Down, Space | Next slide |
| Arrow Left, Page Up | Previous slide |
| F or F11 | Fullscreen presentation only |
| Escape | Exit fullscreen |
