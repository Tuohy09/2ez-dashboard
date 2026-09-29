# Integrated qBittorrent workspace

Open **qBittorrent** from the sidebar, or **More → qBittorrent** on mobile.
The Home service link, saved widgets, and service search also lead into the workspace.
It follows the dashboard's Light, Dark, and OLED appearance settings.

## Controls

- Live torrent list with search, status/category/tag filters, sortable columns,
  page selection, bulk controls, transfer history, and a selected-torrent panel.
- Add magnet/download links and multiple `.torrent` files. Choose save location,
  category, tags, sequential downloading, and whether to start immediately.
- Start/stop, force start, recheck, reannounce, queue order, sequential and
  first/last-piece priority, automatic management, rename, move, and remove.
- Removal keeps downloaded files by default. Deleting files requires explicitly
  checking the permanent-deletion option in the confirmation dialog.
- Global and alternative speed limits; per-torrent speed, ratio, seeding-time,
  and inactive-seeding limits. Speed inputs use KiB/s; requests use bytes/s.
- File progress and priorities, file renaming, tracker add/edit/remove, peer
  inspection/addition, `.torrent` export, and category/tag management.
- Settings for download locations, connections, DHT/PeX/LSD, queueing, and sharing.
  RSS, search plugins, and other advanced preferences remain in the full Web UI,
  accessible from the workspace footer.

The list merges incremental `sync/maindata` updates every 2.5 seconds. Selection
survives updates. Details refresh every five seconds. A connection failure leaves
last-known data visible and disables the main mutation controls until recovery.
Choose a view at the top of the workspace; the choice is saved in this browser.
Filters, sort order, bulk selection, and the inspected torrent survive view changes.

- **Transfer desk:** full-width sortable table; selecting a torrent opens a side
  drawer. Escape or the close button returns to the table. The drawer supports
  nested action forms such as location and limits.
- **Split workspace:** scrollable table above a full-width selected-torrent panel.
  On mobile, selecting a torrent scrolls to its details.
- **Status board:** cards grouped by Downloading, Seeding, and Stopped & attention.
  Both group headings and torrent names open/close their content. Checkboxes are
  independent of inspection; bulk actions and page selection work in every view.
  A selected torrent outside the visible page/filter can be revealed with
  **Show selected transfer**.

Transfer history sits below the selected torrent's details in all three views.
It shows that torrent's download/upload speeds, sampled every 2.5 seconds while
selected, for up to five minutes. Changing the inspected torrent starts a new
history; switching layouts preserves the current history. Samples are held only
in memory and are not qBittorrent's persistent session history.

## Connection configuration

Copy `.env.example` to `.env` and set `QBT_BASE`, `QBT_USERNAME`, and `QBT_PASSWORD`.
The existing deployment has its credentials migrated to this local file. `.env`
is excluded from Git and the Docker build context. Docker Compose passes the
values to the server; credentials are never compiled into the frontend bundle.

The proxy handles both legacy `SID` cookies and qBittorrent 5.2's `QBT_SID_<port>`
cookies, including HTTP 204 login responses. Authentication is shared across
concurrent requests, retries an expired session once, and backs off failed logins.
Neither session cookies nor credentials are logged or returned to the browser.
Same-origin checks and a custom header guard mutations. The route only forwards
listed API endpoints; shutdown/authentication endpoints are not exposed.
Uploads are capped at 32 MB in total. Requests time out after 45 seconds upstream.

This retains the dashboard's existing private-host access model. It does not add
public-user accounts or change qBittorrent's own authentication configuration.

Development requests proxy to the dashboard on port 3080. Set `QBT_PROXY_TARGET`
to a different backend URL when testing a development API server.

## Validation

`npm run lint`, `npm run build`, and `node --test tests/*.test.js` cover static
checks, build, authentication/session handling, proxy boundaries, multipart
forwarding, failed-login backoff, and incremental state merging.

Browser checks cover bulk targeting, file priorities, details, rename, upload,
settings-unit conversion, deletion defaults, connection errors, empty states,
selection across polling, themes, and responsive layouts. A temporary private
torrent with no trackers was used to verify real add/start/stop/rename/priority/
removal operations. It was removed afterward; existing torrents were retained.

API references: [qBittorrent 5.x](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29),
[qBittorrent 4.x](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-4.1%29).

The layout browser regression uses mocked qBittorrent responses and mutations:
`node tests/qbt-layouts.browser.mjs` with Vite running. It requires Playwright;
optionally set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, and `DASHBOARD_TEST_URL` for
local tool installations. It checks layout persistence, independent selection,
per-torrent history, group/card expansion, nested dialogs, bulk targeting,
pagination, themes, mobile widths, errors, and empty states. Screenshots in
`artifacts/2ez-qbittorrent-layout-*-built.png` use sample data.
