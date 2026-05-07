# Setup

## Prerequisites

Install the following first:

- Node.js 20+
- `pnpm` 10.x
- `g++`
- `gdb`
- Chrome or Edge

## 1. Install Node.js and pnpm

Install Node.js 20 or newer first. The repo pins pnpm in `package.json`, so the recommended setup is:

```bash
npm install -g pnpm@10.11.0
```

The normal launcher can also use `npx pnpm@10.11.0` automatically when global `pnpm` is missing.

Verify:

```bash
node --version
pnpm --version
```

## Simple launcher

From the repo root:

```bash
./START_USACO_HELPER.sh
```

On Windows, double-click or run `START_USACO_HELPER.bat`.

The launcher installs dependencies, builds missing files, starts the backend, opens the backend status page, and shows the exact `chrome-extension` folder to load in Chrome.

## 2. Install g++ and gdb

### Windows

Use one of these toolchains:

- MSYS2 + MinGW-w64
- WinLibs
- TDM-GCC

Install both `g++` and `gdb`, then verify:

```bash
g++ --version
gdb --version
```

For closest USACO compatibility, use GCC 7.5 or newer. The helper defaults to USACO C++17 and also supports C++11. Older compilers may accept the flags but differ on some library or language details.

### Linux

Example:

```bash
sudo apt-get update
sudo apt-get install g++ gdb
```

## 3. Install workspace dependencies

From the repo root:

```bash
pnpm install --frozen-lockfile
```

For local development while dependencies are changing, use `pnpm install` instead.

## 4. Build everything

From the repo root:

```bash
pnpm build
```

This compiles shared packages, the backend, and the unpacked extension.

## 5. Start the backend

From the repo root:

```bash
pnpm start:backend
```

The backend listens on:

- `http://127.0.0.1:3777`

Opening that URL directly should show a small JSON status page. The debugger UI itself does not live there; it is injected into `https://ide.usaco.guide/<share-id>` by the Chrome extension.

The default host and port can also be provided through environment variables before first run:

```bash
export USACO_HELPER_HOST=127.0.0.1
export USACO_HELPER_PORT=3777
pnpm start:backend
```

The extension manifest is configured for `127.0.0.1:3777`, so keep those defaults unless you also update and rebuild the extension.

For development with automatic backend reloads, use:

```bash
pnpm dev:backend
```

## 6. Build or watch the extension

For a one-time extension build:

```bash
pnpm build
```

The unpacked extension output is:

- `apps/extension/dist`

For development with automatic extension rebuilds, run this in a second terminal:

```bash
pnpm dev:extension
```

## 7. Load the extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `chrome-extension`
5. If you rebuild later, return to `chrome://extensions` and click the reload icon on this extension

## 8. Configure compiler and debugger paths

If `g++` and `gdb` are not on your system `PATH`, update the backend settings file or use the settings endpoint:

- `apps/backend/.usaco-helper.example.settings.json`

The important compiler setting is:

```json
{
  "cxxStandard": "c++17"
}
```

Use the extension Settings tab to switch between USACO C++17 and USACO C++11. Normal Build/Run uses `-O2 -lm`; Debug uses `-O0 -g` with the same selected standard.

## 9. Use the helper

1. Open a USACO Guide IDE share page such as `https://ide.usaco.guide/<share-id>`.
2. Confirm the helper panel appears on the right side.
3. If the panel does not appear, click the extension icon while the USACO IDE tab is active.
4. Type input in the page `Input` box or in the helper `Input` area.
5. Click `Sync`, then `Build`, `Run`, or `Debug`.
6. Click a line number in the editor gutter to toggle a red breakpoint dot.
7. If you want to override automatic sync, open the helper `Settings` tab, paste source into `Manual source override`, and retry `Sync`.

## 10. Verify before publishing

Run the same checks used by GitHub Actions:

```bash
pnpm --filter @usaco-helper/extension exec playwright install chromium
pnpm verify
```

See [deployment.md](deployment.md) for the GitHub upload checklist.

## Known limitations

- The page adapter is best-effort and may need updates if the USACO DOM changes.
- The extension UI is MVP-level and not yet polished.
- Advanced register/memory/disassembly views are backend-first and only partly surfaced in the current panel.
- Playwright-based extension smoke coverage still assumes a lightweight local fixture rather than a full browser-extension harness.
- Older Windows MinGW toolchains may succeed for local build/run but still be unreliable for GDB stepping or staying attached. If that happens, try a newer GCC/GDB distribution.
