# Load Test Report

## Target
- Goal: 500 connected Socket.io clients and 50 `POST /publish` requests per second.
- Command: `PUBLISH_RATE_LIMIT_MAX=100000 LOAD_SERVER_URL=http://127.0.0.1:3011 LOAD_PUBLISH_URL=http://127.0.0.1:3010 LOAD_CLIENTS=500 LOAD_RATE_PER_SECOND=50 LOAD_DURATION_SECONDS=60 npm run load:test`
- Environment: run against two Node replicas connected through Redis and Nginx.

## Latest Local Check
- Date: 2026-05-15.
- Environment: Windows 11, Docker Desktop, two Node containers on host ports `3010` and `3011`, Redis container on host port `6380`.
- Command: `LOAD_SERVER_URL=http://127.0.0.1:3011 LOAD_PUBLISH_URL=http://127.0.0.1:3010 LOAD_CLIENTS=25 LOAD_RATE_PER_SECOND=5 LOAD_DURATION_SECONDS=5 npm run load:test`
- Result: `deliveries=625`, `p50_ms=5`, `p95_ms=8`.

## Previous Local Load Check
- Date: 2026-05-15.
- Environment: Windows 11, Node `v22.22.2`, Laragon Redis `5.0.14.1`, single Node process with Socket.io Redis adapter enabled.
- Command: `PUBLISH_RATE_LIMIT_MAX=100000 LOAD_CLIENTS=500 LOAD_RATE_PER_SECOND=50 LOAD_DURATION_SECONDS=10 npm run load:test`
- Result: `deliveries=250000`, `p50_ms=12`, `p95_ms=22`.

## Acceptance
- p50 latency: less than 250ms on LAN.
- p95 latency: less than 500ms on LAN.
- No sustained disconnect loop while one replica is restarted.
