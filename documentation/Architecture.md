# Architecture

## Plugin Structure

Time Machine is a sidebar ItemView plugin that reads backup snapshots from Obsidian's built-in file-recovery core plugin (IndexedDB) and presents them with diff visualization and selective restore.

## Layers

### Plugin (`plugin.ts`)

- Lifecycle management (onload/onunload)
- Checks file-recovery availability
- Registers view, commands, settings, file-open event

### Services

- **FileRecoveryService**: Reads from `app.internalPlugins.getEnabledPluginById('file-recovery').db` IndexedDB
- **DiffService**: Wraps `diff` (jsdiff) `structuredPatch` for computing diffs
- **RestoreService**: Full version restore via `vault.modify()` + selective hunk restoration via line manipulation

### Domain

- **backup.ts**: Sorting, date formatting (date-fns), relative time

### UI

- **TimeMachineView**: ItemView in right sidebar, orchestrates components
- **TimelineSliderComponent**: Range input slider (left=newest, right=oldest) with filled track, edge date labels, inline selected date display, auto-select newest; hidden when only one snapshot
- **DiffViewerComponent**: Colored diff hunks with per-hunk restore buttons
- **EmptyState**: Contextual empty messages
- **ConfirmModal**: Confirmation for full restore only

## Data Flow

1. File-open event → `updateForFile(file)`
2. Fetch backups from IndexedDB via FileRecoveryService
3. Filter out snapshots identical to current file content
4. User scrubs timeline slider → compute diff (current vs selected snapshot) via DiffService
5. Render diff in DiffViewerComponent
6. User clicks restore → RestoreService modifies file via vault API

## CSS

All classes prefixed with `tm-`. Uses Tailwind v4 utilities (no preflight/reset) for layout + Obsidian CSS variables for theming. All plugin styles isolated in `@layer components`.
