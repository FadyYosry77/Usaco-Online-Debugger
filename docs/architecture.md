# Architecture

## Overview

The project is a localhost companion for the USACO browser IDE. The online page remains the primary editing surface. The extension adds a helper panel, and the backend performs local build, run, and debug operations.

## Packages and apps

### `packages/shared-types`

This is the contract layer and the single source of truth for:

- settings
- breakpoints
- watches
- test cases
- session snapshots
- build/run/debug result models
- debug session state
- WebSocket event payloads
- API request/response shapes

Both the backend and extension import these models directly.

### `packages/debug-core`

This package parses GDB MI output into structured records:

- result records such as `^done` and `^error`
- async records such as `*stopped`, `*running`, and `=thread-created`
- stream output records such as `~`, `@`, and `&`

The backend uses these parsed records to update local debugger state and emit normalized events to the extension.

### `apps/backend`

The backend is a Fastify service bound to localhost. Its responsibilities are:

- load and persist helper settings
- persist synced source snapshots, breakpoints, watches, and test cases
- manage a temporary local workspace
- compile the synced file with local `g++`
- run the compiled binary with user-provided stdin
- manage a GDB MI process for local debugging
- expose HTTP routes for control operations
- expose a WebSocket feed for live output and debugger events

Key backend modules:

- `server/createServer.ts`
  Route and WebSocket wiring.

- `server/appContext.ts`
  Shared service construction and storage directory setup.

- `services/BuildService.ts`
  Compilation logic and structured diagnostics. Normal Build/Run uses the USACO profile (`-std=c++17` by default, `-O2`, `-lm`). Debug uses the debugger profile (`-O0`, `-g`) with the same selected C++ standard.

- `services/RunService.ts`
  Local process execution, streaming output, timeout handling.

- `services/DebugService.ts`
  Debug state machine, breakpoint handling, variable/stack/thread/register refresh, and memory reads.

- `gdb/GdbMiClient.ts`
  Tokenized MI command/response handling and event-driven record dispatch.

### `apps/extension`

The extension injects a helper panel into supported `https://ide.usaco.guide/<share-id>` pages.

Responsibilities:

- detect supported pages
- inject the page bridge and helper styles
- read visible code through a page adapter
- provide an optional manual source override when editor access is fragile
- call backend HTTP routes for sync/build/run/debug/testcase actions
- listen to backend WebSocket events
- render output, debug state, variables, stack, watches, and testcase controls

## Data flow

### Sync/build/run

1. The content script mounts the helper panel.
2. The user clicks `Sync Code`.
3. The page adapter reads code from the visible editor surface or manual textarea.
4. The extension sends `POST /session/sync-code`.
5. The backend validates that the snapshot looks like a complete C++ source file, persists it, and writes `main.cpp` into the workspace.
6. The user clicks `Build` or `Run`.
7. The backend builds locally with the USACO profile and, for runs, executes the compiled binary locally.
8. Output is returned in JSON and streamed over WebSocket for live updates.

### Debug

1. The user clicks `Debug`.
2. The backend rebuilds the synced source with debug symbols using the debugger profile.
3. The backend starts GDB in MI mode.
4. Saved breakpoints are inserted into the local debugger session.
5. Async MI records update backend debug state.
6. The backend emits normalized events such as `debug_paused`, `variables_updated`, and `stack_updated`.
7. The extension updates the panel accordingly.

## Page adapter boundary

The USACO page integration is intentionally isolated in:

- `apps/extension/src/lib/pageAdapter.ts`

That adapter:

- checks whether the page is a supported USACO page
- tries a page-script bridge first
- falls back only to visible textareas that look like a complete source file
- avoids using partial Monaco DOM fragments as the primary source
- reports suspicious source snapshots as build-output warnings rather than hard-blocking compilation

This keeps uncertain DOM assumptions isolated and prevents the rest of the system from depending on brittle page internals.
