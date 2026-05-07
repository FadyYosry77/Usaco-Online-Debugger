# USACO Local Debug Helper

## Project Summary

USACO Local Debug Helper is a local companion tool for the USACO Guide IDE that helps competitive programming students test, run, and debug C++ solutions directly from the browser. It combines a Chrome extension with a localhost backend to provide code syncing, local compilation, testcase management, runtime output streaming, and GDB-based debugging.

## CV Bullet Points

- Developed **USACO Local Debug Helper**, a browser-based companion tool that helps competitive programming students debug C++ solutions from the USACO Guide IDE.

- Built a **Chrome Extension** using **React, TypeScript, and Vite** to inject an interactive helper panel into supported USACO IDE pages.

- Created a **local Fastify backend** with **Node.js and TypeScript** to sync code, compile C++ files, run solutions, and manage debugging sessions.

- Integrated **GDB/MI** to support debugging features such as breakpoints, step over, step into, step out, variable inspection, stack views, and watch expressions.

- Implemented local testcase management with persistent JSON storage, allowing users to save, edit, and rerun custom inputs during practice.

- Used **WebSockets** to stream live program output, errors, and debugger events between the backend and browser extension.

- Designed the tool with a **local-only safety boundary**, ensuring it supports learning, practice, and post-contest analysis without accessing hidden tests or automating submissions.

- Worked in a **pnpm monorepo** with shared TypeScript packages for API contracts, debugger parsing utilities, reusable UI constants, and automated tests using **Vitest and Playwright**.

## Technologies Used

- **Frontend:** React, TypeScript, Vite, Chrome Extension Manifest V3
- **Backend:** Node.js, Fastify, WebSockets, Zod
- **Debugging / Runtime:** C++, g++, GDB/MI
- **Testing:** Vitest, Playwright
- **Architecture:** pnpm monorepo, shared TypeScript packages, local JSON persistence

## Short CV Version

- Built a TypeScript-based Chrome extension and Fastify backend for the USACO Guide IDE, enabling users to sync C++ code, compile and run locally, manage testcases, and debug with GDB features such as breakpoints, stepping, variables, stack frames, and watch expressions.
