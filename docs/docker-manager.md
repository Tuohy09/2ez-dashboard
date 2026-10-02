# Docker workspace

Open **Docker** in the sidebar. This implements the approved **A · Unified inventory** design and replaces the separate Docker and Stack Manager pages with Containers, Stacks, and Images tabs. The shared typography and Light, Dark, and OLED themes are retained.

## Containers

The searchable, sortable table shows Compose project membership, image references, state, CPU and memory, with 25 items per page. The adjacent inspector shows configuration, published ports, mounts, networks, environment/command, and the latest 200 log lines. Logs can refresh every four seconds. Select an image to inspect its usage, or open the container's Compose project directly in the Stacks tab. Standalone containers remain visible.

Start, stop, restart, pause/resume and removal target the selected container and require confirmation. Removal requires the container to be stopped and never force-removes it or deletes volumes. The dashboard's own container is protected; manage it from the host terminal.

## Stacks

The existing Compose manager is embedded in this tab. New stack creates and validates a file without deploying. Validation, revision checks, atomic saves, backups, explicit deployment, service controls, logs and operation output are preserved. Switching resource tabs, selecting another stack or leaving Docker prompts before discarding unsaved edits. External, multi-file and protected projects retain their existing view-only restrictions. See [stack-manager.md](stack-manager.md).

## Images

Image inventory is grouped by immutable image ID, retaining all local tags and repository digests. Usage includes **running and stopped containers**. Search by repository, tag or digest; filter in-use/unused images, sort and inspect architecture, size, creation date, tags, layers and referencing containers. Size totals are labelled summed sizes because layers can be shared; they are not a promise of reclaimable disk space.

Pull a repository/tag or digest using **Pull image**. Output and status remain available across tab changes. Pulling does not update or recreate containers. Pull jobs are serialized, time out after ten minutes, and retain bounded output for the latest 20 jobs in server memory; server restart clears this history.

**Review unused** filters the inventory without deleting anything. Select up to 25 unused images on the visible page and confirm their exact IDs/tags before removing them. The server rechecks all container references for each image immediately before deletion, uses `force=0&noprune=1`, and reports Docker conflicts. A partially completed batch reports how many images were removed and retains failed/unprocessed targets. Multi-tag images may require resolving Docker's tag conflicts on the host. Volumes are never included in image cleanup.

## Backend and validation

`/docker-api` uses the existing Docker socket and bundled Docker CLI. Writes require a same-origin `X-2ez-docker` header, allowlisted operations and validated identifiers. Pulls use argument arrays, never shell interpolation. Container removal uses `force=0&v=0`. The pre-existing private-host access model and legacy system-metrics endpoints remain in place; this route is not a separate authentication layer.

Run `npm run lint`, `npm run build`, `node --test tests/*.test.js`, and `node tests/docker-manager.browser.mjs`. The browser script defaults to Vite on port 5173 and accepts `DASHBOARD_TEST_URL`, `PLAYWRIGHT_MODULE`, and `CHROMIUM_PATH`. All container, image and stack mutations in browser tests are mocked. Unit tests cover cross-origin rejection, stopped-container image references, targeted deletion, protection of the dashboard, Docker conflicts, and asynchronous pull output. Production verification uses read-only requests only.

API semantics: [Docker Engine API](https://docs.docker.com/reference/api/engine/version/v1.47/) and the installed Docker daemon.
