# Stack Manager

Open **Docker → Stacks** in the dashboard. Stack management is now part of the unified Docker workspace.
It uses Docker Compose directly and shares `/opt/stacks` with the existing Dockge installation.

- **New stack** validates and saves a Compose file without deploying it.
- **Compose → Validate** checks edits without saving. **Save** validates,
  makes a timestamped backup beside the file, then saves atomically. **Deploy**
  applies the saved configuration using `docker compose up -d`.
- **Start**, **Stop**, **Restart**, **Pull images**, and **Take down** operate on
  the selected Compose project. Pulling images does not recreate containers;
  use Deploy afterward. Take down removes containers and networks, retains
  named volumes, and does not delete the Compose file.
- The Containers tab has individual start/stop/restart controls. Logs refresh
  every four seconds while the Logs tab is open. Operation output is retained
  for the latest 40 operations until the dashboard server restarts.
- A stack operation continues when you change tabs. Reopening the stack restores
  its latest operation output. Commands time out after ten minutes; refresh the
  stack to inspect actual state after a timeout or lost connection.

## Compose editor

The existing-stack and new-stack editors include line numbers, YAML syntax
highlighting, Compose-key suggestions, bracket matching, two-space indentation,
code folding, undo/redo, find-and-replace, go-to-line, wrapping, and an expanded
view. The footer tracks the cursor position and whether the draft is modified.

- **Save** validates and backs up the file. **Discard** restores the last loaded
  or saved version after confirmation, without writing anything to the server.
  **Reload** fetches the current file from disk and confirms before replacing edits.
- **Review changes** shows additions and removals against the saved version.
  Saving resets this comparison to the new saved version.
- **Import YAML** loads a local file into the draft; it does not save or deploy.
  **Download YAML** downloads the current draft, including unsaved edits.
- **Ctrl/Cmd+S** saves (or creates a new stack), **Ctrl/Cmd+Enter** validates an
  existing stack, **Ctrl/Cmd+F** searches, and **Tab / Shift+Tab** indent/outdent.
  Press **Esc**, then **Tab** to move keyboard focus out of the editor.
- Validation errors and conflicting disk revisions preserve the draft. Editing
  is locked during a save or reload. External and protected stacks stay read-only.

Edits stay in memory, not browser storage. Leaving with an unsaved draft prompts
for confirmation. Save and Deploy remain separate actions.

Existing project names, container status, working directories, and file locations
come from Docker's Compose labels. Saved files are also discovered one directory
level below `STACKS_DIR`, including undeployed stacks. Both the root directory's
Compose file and common `compose.yaml` / `docker-compose.yaml` names are supported.

Projects outside `/opt/stacks`, projects with inconsistent/multiple Compose file
labels, linked Compose files, and the dashboard's own project are view-only at
stack level. The Containers tab provides individual container inspection.
The editor handles the primary Compose file; manage supporting `.env`, build
contexts, overrides, and profile-specific workflows on the host or in Dockge.
Concurrent saves are rejected if the file changed since it was loaded. Avoid
running operations for the same project in Dockge and 2ez simultaneously; the
operation lock only coordinates requests made through 2ez.

## Runtime

The dashboard image includes `docker-cli` and `docker-cli-compose`. Its Compose
service mounts `/opt/stacks:/opt/stacks` read/write and the Docker socket. Host and
container paths must match so relative Compose bind mounts resolve correctly.
`STACKS_DIR` selects the managed directory. `STACK_HOST_ROOT=/host-root` allows
viewing external project files through the existing read-only host-root mount.

This retains the dashboard's existing private-host access model. Stack Manager
has the same effective Docker authority as the existing container controls and
host terminal. Write requests require a same-origin custom header. Commands use
argument arrays with an allowlist of actions, not shell interpolation.

## Checks

Run `node --test tests/stack-manager.test.js`, `npm run lint`, and `npm run build`.
Backend tests use temporary files and a fake Docker runner; they do not mutate
existing host containers. The implementation was also checked end-to-end using
a disposable Compose project with no ports, host mounts, or network access.

References: [Docker Compose](https://docs.docker.com/reference/cli/docker/compose/),
[configuration validation](https://docs.docker.com/reference/cli/docker/compose/config/),
[deploy behavior](https://docs.docker.com/reference/cli/docker/compose/up/),
[down behavior](https://docs.docker.com/reference/cli/docker/compose/down/).
