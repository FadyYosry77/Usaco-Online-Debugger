# Why Extension-Only Is Not Enough

Chrome extensions cannot directly run local programs. They cannot start:

- `g++`
- `gdb`
- a Node.js/Fastify backend
- arbitrary executable files on the user's computer

This is a browser security boundary. It prevents websites and extensions from executing programs without user consent.

For this project, Build, Run, and Debug need local process execution. That means one of these must exist:

- a local helper app
- a native messaging host
- a packaged desktop app
- a hosted remote backend

The current launcher is the simplest source-based flow. A production no-install-style release should package the helper into a normal app or installer so users do not need to know about Node, pnpm, or the backend.
