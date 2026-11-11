# Desktop host

Run npm run desktop:dev to start Vite on loopback port 5173 and Electron together. Close the window to stop both processes. Run npm run build followed by npm run desktop to open the production build. The Electron entry point is desktop/main.cjs. The packaging configuration must include desktop and dist.

## binvox

The desktop package includes an unmodified binvox binary with its full redistribution license and notices. The host selects this bundled executable by default. Apple Silicon uses the bundled x86_64 helper through Rosetta 2. The readiness check reports launch failures and setup guidance. You can choose another compatible binvox executable through Settings. Its absolute path is saved in settings.json under Electron's userData folder. Official downloads and author information are at https://www.patrickmin.com/binvox/.

The host writes geometry into a unique temporary job folder, executes binvox with -e -d and the selected 32, 64, 128, 256 or 512 resolution, reads input.binvox, and removes that job folder. Shell execution is disabled. A conversion can be cancelled; the default timeout is disabled. Only one conversion runs at a time. Input and output budgets are configurable in Settings (default geometry input 512 MiB, project/output 2 GiB; zero disables the application budget). External file directives remain rejected. Process logs retain the latest 64 KiB. Binary IPC results use typed arrays instead of JavaScript number arrays.

Projects are opened through a native .vxlproj dialog and must be ZIP archives. Saves use a native destination dialog. Both operations use the configurable project budget, defaulting to 2 GiB. The renderer receives only the methods defined in DesktopAPI through a sandboxed, context-isolated preload. Node integration, new windows, webviews, page navigation and permission requests are disabled. Production requests are restricted to packaged dist resources and blob/data URLs. Development uses the explicitly configured loopback HTTP origin and matching WebSocket host.

## Verification

The automated desktop tests cover request validation, argument handling for executable paths containing spaces and shell metacharacters, launch failure, process failure, concurrency, cancellation, timeout and temporary-folder cleanup.

On 2026-11-11 the official Windows binvox executable converted a closed cube through createConverter at resolution 32. The returned BINVOX file was 3,915 bytes and the tool reported 5,768 occupied cells out of 32,768. That verified unmodified Windows binary is now included under resources/binvox/win32-x64 with its redistribution terms.

The same cube also converted successfully at 64³ (15,739 bytes, 23,816 occupied cells) and 128³ (64,313 bytes, 96,776 occupied cells).

On the same machine, 256³ completed in 368 ms (260,411 bytes, 390,152 occupied cells) and 512³ in 546 ms (1,569,095 bytes, 1,566,728 occupied cells), measured through createConverter including temporary input/output work.

Resource limits are persisted atomically with local settings and shared with worker operations. Archive v2 stores separate asset JSON and binary source entries, reads legacy project.json archives, validates directory sizes before inflation and verifies entry CRCs. Standard ZIP technical limits remain explicit. No release should be tagged until source-mode UI and archive migration checks complete.
