# the-office Board

Tauri desktop UI for visualizing and editing the markdown kanban under
`.the-office/features/`.

## Features

- **Open folder** — pick any repo that contains `.the-office/` (walks parents)
- **Kanban columns** — pending · in-progress · review · blocked · completed
- **Drag-and-drop transitions** — same rules as the CLI (`claim`, `review`,
  `done`, `block`)
- **Task detail** — markdown preview + edit for title, tier, DoD, and body
- **Feature filter** — focus on one feature slug at a time

## Develop

```bash
cd board-ui
npm install
npm run tauri dev
```

Frontend-only (browser — Chrome or Edge recommended):

```bash
npm run dev
```

Uses the File System Access API to open a folder, read `.the-office/features/`,
and write task changes back. Drag-and-drop and editing work without Tauri.

## Build

```bash
npm run tauri build
```

Requires the usual [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/)
(`webkit2gtk`, `libgtk-3`, etc.) plus Rust and Node.
