# Native file browser

Open **Files** in the desktop sidebar or mobile **More** menu. Existing File Browser service cards and service search also open this page; modifier-click still opens the full app. `/#files` opens Files directly.

Sign in using your existing File Browser account. The dashboard uses File Browser's folder scope and permissions. Credentials are sent only during sign-in; the upstream token stays in a bounded server-side session behind an HttpOnly, SameSite=Strict cookie. Logins are remembered for 30 days, including page reloads, browser restarts, and dashboard container restarts. The saved sessions live in the persistent `file-browser-sessions` Docker volume (`FILE_BROWSER_SESSION_FILE`), with private file permissions. Passwords are never saved. The dashboard renews upstream tokens before expiry while it is running, coalesces simultaneous renewals, and retains the session through temporary connection failures. Sign-out deletes the saved session. An upstream rejection, an expired token after a prolonged dashboard outage, or the 30-day session limit requires sign-in again. Every browser signs in independently. `FILE_BROWSER_BASE` defaults to the existing service at `https://2ez.dinosaur-banana.ts.net:8084` and can be configured in Compose. Vite forwards `/files-api` to the dashboard backend on port 3080; use `FILES_PROXY_TARGET` for a different development backend.

The page supports folder navigation and breadcrumbs, filename filtering within the current folder, name/size/modified sorting, hidden files, persistent folder pins, metadata, safe text/image/audio/video previews, streamed file downloads, and copying paths. Text previews are bounded to 128 KB. Browser media support determines which audio/video formats play; other files can be downloaded. HTML is displayed as text or downloaded rather than executed. Uploads, edits, moves, sharing, and deletions remain available through **Full File Browser**.

Five layouts share the same behavior and the selected view persists:

- **Explorer:** locations, divided file rows, right-side details.
- **Gallery:** file tiles, image thumbnails, selected-file preview below.
- **Columns:** current folder and its two nearest ancestors.
- **Compact:** full-width dense file rows with details below.
- **Split view:** two independently browsable folders; details below. Filename filtering and sorting apply to both lists, and the left folder drives the top breadcrumbs and locations.

On desktop, Files uses the full available canvas and a workspace that grows with the viewport height. Explorer and Columns allocate space for file details only while a file is selected.

All layouts follow the dashboard's Light, Dark, and OLED themes. On mobile the locations become a scrollable folder bar, columns scroll inside their panel, split folders stack, and selecting a file scrolls to its preview. Loading, empty, search-empty, network-error, permission-denied, and expired-session states include a next action.

## Visual comparison

`/?filesPreview=1&filesView=explorer` opens clearly marked sample files without authentication or contacting File Browser. Replace `explorer` with `gallery`, `columns`, `compact`, or `split`. The page's **Browse my files** button returns to the account sign-in flow. Sample downloads show an explanatory message rather than returning a fake file.

`artifacts/file-browser/` contains desktop/mobile screenshots, individual self-contained HTML mockups, and a comparison page. Files, sizes, dates, and artwork in these artifacts are samples. These are exploratory directions; the approved `design-spec.md` remains unchanged pending a visual preference.

## Deployment

Build the frontend and recreate the dashboard container to include the new backend module:

```sh
npm run build
docker compose up -d --build 2ez-dashboard
```

## Verification

```sh
npm run lint
npm run build
node --test tests/file-browser-proxy.test.js
node tests/files.browser.mjs
node tests/files-session.browser.mjs
```

The browser script accepts `DASHBOARD_TEST_URL`, `PLAYWRIGHT_MODULE`, and `CHROMIUM_PATH`. It uses intercepted sample API responses, performs no live file writes, and checks authentication, navigation, file filtering and sorting, pins, hidden files, previews, downloads, independent split folders, states, mobile selection, and all five views across Light/Dark/OLED at 320–1680px. Live authenticated file browsing still requires the user's File Browser sign-in.

Session regression tests use real cookies and a temporary saved-session file; they verify reloads, cookie restoration in a new browser context, server restarts, token renewal, network recovery, and logout revocation.
