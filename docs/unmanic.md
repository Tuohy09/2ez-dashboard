# Native Unmanic page

Open **Unmanic** in the sidebar, or click its existing dashboard widget. The native page keeps the dashboard typography and Light, Dark, and OLED themes.

One combined workspace uses collapsible status groups and cards above a full-width selected-job details panel. Clicking the selected card again closes its details. Group controls collapse the cards independently. Queue, Workers, History, and Libraries share this view; there is no layout selector. The former Downloads & Transcodes page has been removed, with direct links to qBittorrent and Unmanic instead. Queue and history use server-side search and 25-item pagination; history can be filtered by result and the queue by library.

Workers show their current file, progress, encoding speed when reported, resource usage, plugin steps, command, and recent log output. Completed jobs expose processing times and saved logs. Counts and state refresh every four seconds. Logs are rendered as text, including any HTML supplied by Unmanic.

Controls include individual/all-worker pause and resume, stopping a current job, queue reordering and removal, adding a file, library scan controls, reprocessing history entries, and deleting history records. Destructive operations, scans, and reprocessing require an in-page confirmation describing their effects. Bulk operations target only explicitly selected IDs, with at most 25 selected on a page. Paths for adding files must be absolute paths visible inside Unmanic. Processing follows that library's configured plugins; adding a file directly bypasses scanner file-test plugins. Advanced library/plugin configuration remains available through **Full Unmanic UI**.

## Connection

`UNMANIC_BASE` defaults to `http://127.0.0.1:8888/unmanic`. Set it to the Unmanic application root, excluding `/api/v2`. Recreate the dashboard container after changing it. The native `/um-api` router allows specific API operations, validates request fields, bounds page and batch sizes, and requires a same-origin custom-header request for POST/DELETE. It does not forward dashboard cookies or credentials upstream. Network errors are reported without exposing connection details. This router is not an authentication layer; retain the dashboard's existing access restrictions. The existing `/unmanic/` full-UI proxy is unchanged. The native API uses `/um-api` because the production reverse proxy sends `/unmanic*` paths directly to Unmanic.

For local Vite development, `/um-api` forwards to the dashboard server on port 3080. Override `UNMANIC_PROXY_TARGET` to use a separate test server.

Implemented against the installed Unmanic **0.4.1~1c324b8** API, including `pending/tasks` (the previous dashboard widget used the obsolete `pending/list`). Reference: [pending task workflow](https://docs.unmanic.app/docs/dashboard/pending_tasks/) and [processing workflow](https://docs.unmanic.app/docs/using_unmanic/workflow/). API fields were checked against the installed server source and read-only responses.

## Verification

- `npm run lint`
- `npm run build`
- `node --test tests/*.test.js`
- `node tests/unmanic.browser.mjs` against Vite (defaults to port 5173).

The browser script accepts `DASHBOARD_TEST_URL`, `PLAYWRIGHT_MODULE`, and `CHROMIUM_PATH`. It intercepts every native Unmanic request, including all writes, and checks the combined workspace, confirmations, worker/queue/scan controls, logs, filters, pagination, failure and empty states, legacy layout preferences, native navigation, and overflow at 320–1920px across all themes. Preview screenshots use fictional sample jobs. Live verification must use GET and the read-only POST endpoints only, preserving worker and queue state.
