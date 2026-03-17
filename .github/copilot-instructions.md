# Project Guidelines

## Architecture

- This is a browser-first Vite + TypeScript app that performs file conversion entirely client-side.
- Keep the main UI flow in [src/main.ts](../src/main.ts): file selection, format list building, conversion path routing, and popup/status updates live there.
- Conversion tools live in [src/handlers](../src/handlers) and must implement the `FormatHandler` interface from [src/FormatHandler.ts](../src/FormatHandler.ts).
- Register new handlers in [src/handlers/index.ts](../src/handlers/index.ts) using the existing guarded instantiation pattern so missing dependencies do not crash the app.

## Handler Conventions

- Follow the existing naming pattern: handler classes end with `Handler`, and the file name should match the wrapped tool or format family.
- `init()` is responsible for populating `supportedFormats` and setting `ready = true`.
- `doConvert()` must return new output entries with the correct final file names and extensions.
- Handlers are responsible for buffer safety. If there is any chance code may mutate incoming or outgoing bytes, clone with `new Uint8Array(...)`.
- Normalize MIME types with `normalizeMimeType()` before matching or comparing them.
- Use `supportAnyInput` only for true fallback handlers.
- If a handler needs extra assets, wasm files, or browser-only globals, follow the existing browser-first patterns instead of introducing server-side assumptions.

## TypeScript And Imports

- Preserve the repo's existing TypeScript style: strict typing, explicit interfaces, and async methods for handler lifecycle work.
- This repo allows TypeScript extension imports and also contains `.js` specifiers in TS files. Follow the surrounding file's import style instead of normalizing imports across the project.
- Keep changes small and local. Do not refactor unrelated handlers or rename public format identifiers unless the task requires it.

## Assets And Build Constraints

- The deployed app runs under the `/convert/` base path. Do not change hardcoded asset URLs or routing assumptions unless the task is specifically about deployment.
- Wasm and other static runtime assets must remain compatible with [vite.config.js](../vite.config.js). If a new dependency needs copied build assets, update the Vite static copy config.
- Docker, nginx, and `buildCache.js` assume the built site is served from `/convert/`. Keep those paths aligned when touching build or deployment code.
- The format cache is generated after build. If a change affects discovered supported formats, keep cache generation in mind.

## Validation

- Prefer the existing package scripts for validation: `npm run build` for a full TypeScript + Vite build, and `npm run dev` for local iteration.
- The README also documents Bun-based development and Docker flows. Preserve those workflows when changing build tooling.
- When adding a new handler, verify both registration and at least one realistic input/output path.

## Contribution Focus

- Favor root-cause fixes over UI-only workarounds.
- When adding format support, update only the files needed for that handler, its assets, and its registration.
- Preserve the current user-facing behavior where the app attempts a best-effort conversion path instead of failing early when a direct conversion is unavailable.