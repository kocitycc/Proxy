# Proxy

A simple auth proxy server for kocity.

## How it works

1. Listens on the configured public proxy port for client connections, then forwards authenticated traffic to the internal game engine port (`23600` by default).
2. Reads launcher credentials from `credentials.username`.
3. Calls `POST {authServer}/auth/validate` to bind the auth key to this node.
4. Resolves or registers the local game user by `nucleus_id` / username.
5. Notifies `POST {authServer}/auth/connect` on successful bind.
6. Proxies the request to the internal engine (WebSocket supported).
7. Heartbeats the global server list every minute with the current player count.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)

## Setup

```bash
npm install
npx prisma generate
cp .env.example .env
npm run build
npm start
```

Each server edits its own `.env`. The Docker image stays the same everywhere.

## Configuration

Environment variables are preferred. `config.json` is optional and can be copied from `config.example.json` if needed.

Key values:

- **`AUTH_SERVER`** - Auth API base URL, e.g. `https://api.kocity.cc`.
- **`PUBLIC_ADDRESS`** - The `host:port` clients use to reach this server.
- **`SERVER_SECRET`** - Pre-shared heartbeat key for this server.
- **`EXTERNAL_PORT` / `INTERNAL_PORT`** - External is what players connect to; internal is the game engine.

## Docker

```bash
docker run --rm --env-file .env -p 23600:23600 ghcr.io/kocitycc/proxy:latest
```

## Operations

- **Logs** - `./logs/log-YYYY-MM-DD.txt`
- **Health** - `GET /stats/status`
- **Preflight** - `GET /stats/preflight`

## Related

- [github.com/kocitycc/Auth](https://github.com/kocitycc/Auth)
