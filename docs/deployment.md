# Deployment and GitHub Publishing

This project is a local companion app, not a hosted web service. Deployment means publishing the source to GitHub and giving users reproducible commands to build the local backend and unpacked Chrome extension on their own machines.

## What gets published

Commit the source, docs, lockfile, and workflow files:

- `apps/`
- `chrome-extension/`
- `packages/`
- `docs/`
- `.github/`
- `.env.example`
- `.gitignore`
- `.node-version`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `README.md`
- `START_HERE.md`
- `START_USACO_HELPER.sh`
- `START_USACO_HELPER.bat`
- `DIRECT_CHROME_EXTENSION.md`
- `scripts/`
- `tsconfig.base.json`

This export intentionally includes `chrome-extension/` so the Chrome extension can be loaded directly after cloning. Do not commit other generated or local-only files:

- `node_modules/`
- any `dist/` directory
- any `.usaco-helper/` directory
- `apps/backend/tmp/`
- `apps/extension/test-results/`
- `.env`
- local executable outputs such as `*.exe` and `*.out`
- logs, coverage, and cache folders

The `.gitignore` file is configured for those exclusions.

## Fresh clone smoke test

Use these commands before publishing a release or sharing the repo:

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @usaco-helper/extension exec playwright install chromium
pnpm verify
```

If `corepack` is not available, install pnpm directly:

```bash
npm install -g pnpm@10.11.0
```

## Local run after cloning

```bash
pnpm build
pnpm start:backend
```

Then load the unpacked extension from:

```text
chrome-extension
```

Open a supported USACO Guide IDE page:

```text
https://ide.usaco.guide/<share-id>
```

The backend status endpoint is:

```text
http://127.0.0.1:3777
```

## GitHub upload steps

From this folder:

```bash
git init
git add .
git status --short
git commit -m "Prepare USACO Local Debug Helper for release"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

After pushing, confirm the GitHub Actions `CI` workflow passes.
