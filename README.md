# LearnPress Chat Server

Socket.io fanout service for the LearnPress Chat Room addon.

Use this service when the WordPress addon is configured with the `Socket.io`
transport driver. If the addon uses the default `Polling` driver, this service
is not required.

## Supported Developer Setup

The recommended setup for every developer is Docker Compose. It works the same
way on Linux, macOS, and Windows.

Prerequisites:

- Docker Engine or Docker Desktop with Docker Compose v2.
- Node.js 20+ only if you want to run tests, load tests, or start the service
  directly without Docker.
- A WordPress site with LearnPress and the LearnPress Chat Room addon enabled.

## Global Local Ports

The default ports avoid common local stacks such as Laragon, MAMP, Valet,
Docker Desktop databases, and native Redis:

| Service | Host URL / port | Container port | Purpose |
| --- | --- | ---: | --- |
| Socket.io primary | `http://127.0.0.1:3010` | `3000` | Main URL for WordPress admin. |
| Socket.io secondary | `http://127.0.0.1:3011` | `3000` | Second replica for HA/load testing. |
| Redis | `127.0.0.1:6380` | `6379` | Shared Socket.io Redis adapter. |

If a developer already uses one of these host ports, change only the host-side
values in `.env`; leave the container ports unchanged unless you know you need
to change them.

## Quick Start With Docker

Run these commands from the repository root, the directory containing
`docker-compose.yml`.

Linux / macOS:

```bash
cp .env.example .env
openssl rand -hex 32
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Copy the generated secret into both `.env` values:

```dotenv
JWT_SECRET=<same-generated-secret>
WP_SHARED_SECRET=<same-generated-secret>
```

Start the stack:

```bash
docker compose up --build
```

Run in the background:

```bash
docker compose up --build -d
```

Stop the stack:

```bash
docker compose down
```

## Docker Configuration

Docker Compose reads `.env` automatically.

| Variable | Default | Used by | Description |
| --- | --- | --- | --- |
| `CONTAINER_PORT` | `3000` | Node containers | Internal HTTP/Socket.io port. Usually do not change. |
| `CHAT_SERVER_HOST_PORT` | `3010` | Host -> primary container | Public local port for the primary Socket.io server. |
| `CHAT_SERVER_SECONDARY_HOST_PORT` | `3011` | Host -> secondary container | Public local port for the second Socket.io replica. |
| `REDIS_HOST_PORT` | `6380` | Host -> Redis container | Local Redis port exposed for diagnostics and direct Node mode. |
| `JWT_SECRET` | `change-me` | Node containers | HS256 secret used to verify client JWTs from WordPress. |
| `WP_SHARED_SECRET` | `change-me` | Node containers | HMAC secret used to verify WordPress `POST /publish` calls. |
| `CORS_ORIGIN` | `*` | Node containers | Allowed browser origin. Use your site URL in production. |
| `PUBLISH_RATE_LIMIT_WINDOW_MS` | `60000` | Node containers | Publish endpoint rate-limit window. |
| `PUBLISH_RATE_LIMIT_MAX` | `120` | Node containers | Max publish calls per rate-limit window. |

The current WordPress addon exposes one Socket.io secret setting, so
`JWT_SECRET`, `WP_SHARED_SECRET`, and the WordPress `Socket.io HMAC secret`
must all be the same value.

## WordPress Admin Configuration

There are two WordPress admin configuration areas.

### 1. Global Chat Transport

Path:

`wp-admin -> LearnPress -> Settings -> Chat Room`

Set these global values for every site using this Socket.io service:

| Field | Local Docker value |
| --- | --- |
| Transport driver | `Socket.io (requires self-hosted Node service)` |
| Socket.io URL | `http://127.0.0.1:3010` |
| Socket.io HMAC secret | Same generated secret used for `JWT_SECRET` and `WP_SHARED_SECRET`. |
| JWT TTL (seconds) | `300` |

WordPress option names:

| Field | Option name |
| --- | --- |
| Transport driver | `chat_room_transport` |
| Socket.io URL | `chat_room_socket_url` |
| Socket.io HMAC secret | `chat_room_socket_secret` |
| JWT TTL (seconds) | `chat_room_socket_jwt_ttl` |

URL guidance:

- Same machine local development: `http://127.0.0.1:3010`
- Another device on the LAN: `http://<developer-machine-lan-ip>:3010`
- HTTPS / production: use the public reverse-proxy URL, for example
  `https://chat.example.test`
- Use `http://127.0.0.1:3011` only when intentionally testing the secondary
  replica.

### 2. Course Chat Room

Path:

`wp-admin -> LearnPress -> Courses -> Edit Course -> Chat Room`

Use this tab per course:

- `Create chat room` creates the course-scoped room and syncs enrolled users.
- `Open in chat manager` opens the room admin screen for existing rooms.
- `Delete chat room` removes that course chat room and its messages. The course
  itself is not deleted.

The Socket.io server does not create rooms or members. WordPress owns room data
and publishes room events to this server.

## Smoke Checks

Linux / macOS:

```bash
curl http://127.0.0.1:3010/healthz
curl http://127.0.0.1:3011/healthz
```

Windows PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3010/healthz
Invoke-RestMethod http://127.0.0.1:3011/healthz
```

Expected result: both replicas report healthy service state and Redis readiness.

Then test WordPress:

1. Configure the global Chat Room transport settings.
2. Create a course chat room from the course editor.
3. Open the course chat as two logged-in users.
4. Send a message from user A and confirm user B receives it.
5. Type in one tab and confirm the other tab shows the typing indicator.

## Direct Node Mode

Docker is preferred. Direct Node mode is useful for debugging one server
process locally.

Install and build:

```bash
npm install
npm run build
```

Start Redis with Docker:

```bash
docker compose up -d redis
```

Start the Node service:

```bash
npm start
```

Direct Node mode uses:

- `PORT` for the service port, default `3010`.
- `REDIS_URL`, default `redis://127.0.0.1:6380`.

## Runtime Endpoints

- `GET /healthz` returns service and Redis readiness.
- `GET /metrics` exposes Prometheus metrics.
- `POST /publish` accepts `{ "room_id": 1, "event": "message.created", "payload": {} }`.

`POST /publish` requires `X-Signature` to contain:

```text
base64(HMAC-SHA256(raw request body, WP_SHARED_SECRET))
```

That matches the LearnPress addon `SocketHmacSigner`. Hex
`sha256=<digest>` is also accepted for diagnostics.

## Socket.io Client Contract

The WordPress addon fetches a JWT from:

`/wp-json/lp/v1/chat/socket/token`

Clients connect to the Socket.io server with `auth.token` containing an HS256
JWT:

```json
{
  "sub": 123,
  "rooms": [1, 2, 3],
  "iat": 1760000000,
  "exp": 1760000300
}
```

The `subscribe` and `typing` events only operate for room IDs included in
`claims.rooms`.

The server accepts clients on the root Socket.io namespace for the WordPress
addon and keeps `/chat` available for direct namespace tests.

## Production Notes

- Replace `change-me` secrets before deploying.
- Set `CORS_ORIGIN` to the exact WordPress origin.
- Put the service behind HTTPS with a reverse proxy.
- Proxy both normal HTTP requests and Socket.io WebSocket upgrades.
- Keep the WordPress `Socket.io URL` set to the public HTTPS URL.
- Do not expose Redis publicly.

An example Nginx config is available in `ops/nginx-learnpress-chat.conf`.

## Load Test

Linux / macOS:

```bash
PUBLISH_RATE_LIMIT_MAX=100000 \
LOAD_SERVER_URL=http://127.0.0.1:3011 \
LOAD_PUBLISH_URL=http://127.0.0.1:3010 \
LOAD_CLIENTS=500 \
LOAD_RATE_PER_SECOND=50 \
LOAD_DURATION_SECONDS=60 \
npm run load:test
```

Windows PowerShell:

```powershell
$env:PUBLISH_RATE_LIMIT_MAX="100000"
$env:LOAD_SERVER_URL="http://127.0.0.1:3011"
$env:LOAD_PUBLISH_URL="http://127.0.0.1:3010"
$env:LOAD_CLIENTS="500"
$env:LOAD_RATE_PER_SECOND="50"
$env:LOAD_DURATION_SECONDS="60"
npm run load:test
```

Use smaller defaults for local smoke checks. Record full-scale results in
`docs/load-test-report.md`.
