# Hecate

> Custom WhisperGate-themed web UI for [Mythic C2](https://github.com/its-a-feature/Mythic) (v3)

Crimson-black operator interface replacing Mythic's built-in React UI. Talks directly to Mythic's existing GraphQL/WebSocket API — no Mythic modifications required.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Styling | Vanilla CSS Modules + custom design tokens |
| GraphQL | Apollo Client 3 |
| Real-time | GraphQL Subscriptions over WebSocket (`graphql-ws`) |
| State | Zustand |
| Serve (prod) | nginx (Docker) |

---

## Prerequisites

- A running Mythic instance (v3.x)
- Docker + Docker Compose

---

## Running

Hecate runs inside Docker and joins Mythic's network directly — no host bridging required.

```bash
# Verify Mythic's network exists first
docker network ls | grep mythic   # should show mythic_default

# Build and start
docker compose up -d --build
# → http://localhost:3100
```

If Mythic is on a different machine, pass the host at build time:

```bash
docker build --build-arg MYTHIC_HOST=10.10.0.5:7443 -t hecate .
docker run -p 3100:80 hecate
```

---

## Features

- **Callback list** — live subscription, alive/idle/dead status, sleep-aware check-in detection
- **Task feed** — split-pane view (task list + full output) or terminal console view
- **File browser** — `ls` output rendered as an interactive file explorer; click to download files or navigate directories
- **Command bar** — tab completion against the agent's command list, command history (↑/↓)
- **Network topology** — SVG graph of callback hierarchy, protocol-aware connection lines (HTTP/SMB/TCP), broken lines for dead agents
- **Payload manager** — build, list, and delete payloads with full C2 parameter configuration
- **Right panel** — op stats, agent detail, network graph

---

## Project Structure

```
src/
├── apollo/
│   ├── client.ts          Apollo setup, WS link (lazy), login/logout
│   └── operations.ts      All GQL queries, mutations, subscriptions
├── components/
│   ├── CommandBar/        Input, tab completion, history
│   ├── Rail/              Icon strip — switches sidebar view
│   ├── RightPanel/        Stats, network topology SVG
│   ├── Sidebar/           Callback list + selected agent detail
│   ├── TaskFeed/          Feed + console views, FileBrowser renderer
│   └── Topbar/            Logo, operation badge
├── store/index.ts         Zustand store (token, operation, callbacks, tasks)
├── styles/tokens.css      Design tokens (palette, spacing, fonts)
└── views/                 Login → OperationSelect → Dashboard
```

---

## Mythic Endpoints

| Endpoint | Protocol | Purpose |
|---|---|---|
| `/auth` | HTTPS POST | Obtain Bearer token |
| `/graphql/` | HTTPS | Queries + mutations (trailing slash required) |
| `/graphql/` | WebSocket | Subscriptions |

All proxied through nginx → `mythic_nginx:7443`.

---

## Licence

For authorized red team use only.
