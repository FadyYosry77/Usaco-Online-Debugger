# Security Boundary

## Allowed use

This tool is a **local-only helper** for:

- practice
- training
- mock contests
- post-contest analysis

## Explicitly disallowed use

This project must not be used or extended to:

- bypass official contest rules
- scrape hidden test cases
- automate restricted submissions
- tamper with remote judge systems
- extract hidden or private contest data
- provide a one-click cheating workflow

## Current technical safeguards

- The backend binds to localhost only.
- Build, run, and debug execution are local only.
- The backend only executes code the user explicitly synced.
- The backend only uses input the user explicitly provided.
- The page adapter only reads user-visible content and manual pasted content.
- No hidden page/network data extraction is implemented.
- No remote judge interaction is implemented.

## Product stance

The helper is positioned as a transparent local debugger companion, not as a contest-bypass product. The UI, docs, route surface, and implementation should continue to preserve that boundary in future changes.
