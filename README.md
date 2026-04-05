# Hecate

> Custom WhisperGate-themed web UI for [Mythic C2](https://github.com/its-a-feature/Mythic)

Crimson-black operator interface. Vanilla CSS, React, Apollo Client, WebSocket subscriptions.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Styling | Vanilla CSS Modules + custom design tokens |
| GraphQL | Apollo Client 3 |
| Real-time | GraphQL Subscriptions over WebSocket (`graphql-ws`) |
| State | Zustand |
| Terminal output | xterm.js |
| Serve (prod) | nginx (Docker) |

---

## Prerequisites

- Node.js 20+
- A running Mythic instance (v3.x) accessible at a known host:port
- Docker + Docker Compose (for containerised deploy)

---

## Local Development (no Docker)

```bash
# 1. Clone / unzip and enter the project
cd hecate

# 2. Install dependencies
npm install

# 3. Configure your Mythic host
cp .env.example .env
# Edit .env:  VITE_MYTHIC_HOST=<your-mythic-host>:7443

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

Vite proxies `/api` to Mythic. For GraphQL + WebSocket the dev server
connects directly to `https://<VITE_MYTHIC_HOST>/graphql`.
Accept the self-signed cert warning in your browser once.

---

## Docker (recommended for ops use)

### Quick start

```bash
# Build and run (Mythic running on the host at :7443)
docker compose up -d

# Hecate available at:
http://localhost:3100
```

### Custom Mythic host

If Mythic is on a different machine:

```bash
# Edit docker-compose.yml → mythic-backend-proxy → command:
# Replace host.docker.internal with your Mythic IP

# Or build with the host baked in:
docker build --build-arg MYTHIC_HOST=10.10.0.5:7443 -t hecate .
docker run -p 3100:80 hecate
```

### Mythic already in Docker on same network?

Remove the `mythic-backend-proxy` service from `docker-compose.yml`
and update `nginx.conf` to point at your Mythic container name:

```nginx
proxy_pass https://mythic_server:7443/graphql;
```

---

## Testing Without a Live Mythic Instance

### Option A — Mythic's built-in demo mode

```bash
git clone https://github.com/its-a-feature/Mythic
cd Mythic
sudo ./mythic-cli start
# Default creds: mythic_admin / mythic_password  (check .env)
```

Then point Hecate at `localhost:7443`.

### Option B — GraphQL mock server (no Mythic needed)

Install and run a local mock that speaks Mythic's schema:

```bash
npm install -g @graphql-tools/mock
# Coming: hecate/mock/server.ts  (see CONTRIBUTING)
```

### Option C — Static fixture mode (UI-only)

Set `VITE_MOCK=true` in `.env`. Hecate will load from
`src/fixtures/` instead of hitting Apollo — useful for
pure UI development and design iteration.

> `VITE_MOCK` mode is not yet implemented — contributions welcome.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_MYTHIC_HOST` | `localhost:7443` | Mythic server host:port |

---

## Project Structure

```
hecate/
├── src/
│   ├── apollo/
│   │   ├── client.ts         Apollo + WebSocket setup
│   │   └── operations.ts     All GQL queries/mutations/subscriptions
│   ├── components/
│   │   ├── CommandBar/       Task input, history navigation
│   │   ├── Rail/             Icon sidebar
│   │   ├── RightPanel/       Stats, network graph, MITRE tags
│   │   ├── Sidebar/          Callback list + agent detail
│   │   ├── TaskFeed/         Live task output blocks
│   │   ├── Topbar/           Logo, op badge, user
│   │   └── shared/
│   │       └── WgSigil.tsx   WhisperGate hexagonal sigil SVG
│   ├── store/
│   │   └── index.ts          Zustand global state
│   ├── styles/
│   │   ├── tokens.css        Design tokens (palette, spacing, fonts)
│   │   └── global.css        Resets, shared classes, animations
│   └── views/
│       ├── Login.tsx
│       └── Dashboard.tsx
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── vite.config.ts
```

---

## Mythic GraphQL Endpoint Reference

| Endpoint | Protocol | Purpose |
|---|---|---|
| `https://<host>:7443/graphql` | HTTPS | Queries + mutations |
| `wss://<host>:7443/graphql` | WebSocket | Subscriptions (live callbacks, task output) |
| `https://<host>:7443/auth/login` | HTTPS POST | Get Bearer token |

Full schema: https://docs.mythic-c2.net/

---

## Licence

For authorized red team use only.
