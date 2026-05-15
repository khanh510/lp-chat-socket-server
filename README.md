# LearnPress Chat Server

Socket.io fanout service for the LearnPress Chat Room Socket transport.

## Runtime

```bash
cp .env.example .env
npm install
npm run build
npm start
```

The service requires `JWT_SECRET` and `WP_SHARED_SECRET`. The current LearnPress plugin has one `chat_room_socket_secret` setting, so set both Node values to the same secret. In production, both values must be changed from `change-me`.

Default local ports avoid the standard Laragon bindings:

- Socket.io replica 1: `http://127.0.0.1:3010`
- Socket.io replica 2: `http://127.0.0.1:3011`
- Docker Redis host port: `6380` mapped to container port `6379`

## Endpoints

- `GET /healthz` returns service and Redis readiness.
- `GET /metrics` exposes Prometheus metrics.
- `POST /publish` accepts `{ "room_id": 1, "event": "message.created", "payload": {} }`.

`POST /publish` requires `X-Signature` to contain `base64(HMAC-SHA256(raw request body, WP_SHARED_SECRET))`, matching the LearnPress plugin's `SocketHmacSigner`. Hex `sha256=<digest>` is also accepted for diagnostics.

Use the base URL in the LearnPress plugin setting, for example `http://127.0.0.1:3010`. The server accepts clients on the root Socket.io namespace for the plugin and also keeps `/chat` available for direct namespace tests.

## Socket Namespace

Clients connect to `/chat` with `auth.token` containing an HS256 JWT:

```json
{
  "sub": 123,
  "rooms": [1, 2, 3],
  "iat": 1760000000,
  "exp": 1760000300
}
```

The `subscribe` and `typing` events only operate for rooms included in `claims.rooms`.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Two Node services are exposed on host ports `3010` and `3011`, sharing Redis through the Socket.io Redis adapter. Redis is exposed on host port `6380` to avoid conflicts with Laragon Redis on `6379`.

## Load Test

```bash
PUBLISH_RATE_LIMIT_MAX=100000 LOAD_SERVER_URL=http://127.0.0.1:3011 LOAD_PUBLISH_URL=http://127.0.0.1:3010 LOAD_CLIENTS=500 LOAD_RATE_PER_SECOND=50 LOAD_DURATION_SECONDS=60 npm run load:test
```

Use the smaller defaults for local smoke checks. Record full-scale results in `docs/load-test-report.md`.
