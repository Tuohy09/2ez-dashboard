# Service access and maintenance

The Node service binds only to `127.0.0.1:3080`. Caddy forwards the existing
`https://2ez.dinosaur-banana.ts.net` dashboard to it. Incoming forwarded clients
must have a Tailscale IPv4 or IPv6 address; LAN/public forwarded addresses are
rejected. The local host remains trusted. This preserves the private tailnet
access model; there is no additional dashboard login or per-user role system.
Tailnet ACLs should grant dashboard access only to administrators: its terminal
and Docker management have host authority.

`DASHBOARD_ORIGINS` is a comma-separated list of exact origins, including scheme
and port. It constrains HTTP hosts, browser origins, and WebSocket upgrades.
Only a loopback reverse proxy is trusted, with the immediate client in the last
`X-Forwarded-For` position (Caddy's default behavior). Do not expose the backend
through a proxy that omits or accepts spoofed client-address headers.

For local development, include `http://localhost:5173` and/or
`http://127.0.0.1:5173` in the backend's `DASHBOARD_ORIGINS`; Vite preserves the
browser Host/Origin when forwarding requests. Alternative backend ports also
need their own exact origin configured.

Terminal upgrades require an allowed Origin and access through this boundary.
Each backend allows four simultaneous terminals, limits incoming messages to
16 KiB, bounds resize dimensions, checks heartbeat responses, and disconnects
clients that accumulate excessive output. Legacy `/sys-api/docker/*` mutations
return HTTP 410. Use `/docker-api` for lifecycle changes.

Widget credentials are server-only `.env`/Compose variables:
`JELLYFIN_API_KEY`, `NAVIDROME_AUTH_PARAMS`, and `SPEEDTEST_API_TOKEN`.
Read-only `/widget-api` endpoints forward fixed requests, cache responses briefly,
and combine concurrent requests. Credentials are not included in the frontend
build. Existing credentials were retained during migration; moving them does
not revoke earlier copies. Rotate them at their source if old bundles or repository
history were distributed outside the trusted admin group.

Raw file transfers use a 30-second header/read-idle timeout rather than a total
30-second deadline. Browser disconnection cancels the upstream transfer.
Filesystem usage is sampled asynchronously and cached for 10 seconds; process
snapshots are shared for 2 seconds. Heavy pages and xterm load on demand.
Hashed frontend assets are immutable for one year; HTML is revalidated.

Run `npm run lint`, `node --test tests/*.test.js`, `npm run build`, and `npm audit`.
`docker compose build` now builds the frontend itself using the lockfile, so it
cannot accidentally ship stale local `dist` files. `docker compose up -d --no-deps
2ez-dashboard` recreates only the dashboard. `/healthz` and the Docker healthcheck
verify the HTTP service; connected upstreams have their own status/error states.
File Browser sessions remain in the existing named volume across replacement.
