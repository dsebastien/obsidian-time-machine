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
- **VersionListComponent**: Scrollable timeline with single/dual selection
- **DiffViewerComponent**: Colored diff with per-hunk restore
- **CompareModeSelectorComponent**: Current-vs-version / version-vs-version
- **EmptyState**: Contextual empty messages
- **ConfirmModal**: Confirmation for full restore only

## Data Flow

1. File-open event → `updateForFile(file)`
2. Fetch backups from IndexedDB via FileRecoveryService
3. User selects version → compute diff via DiffService
4. Render diff in DiffViewerComponent
5. User clicks restore → RestoreService modifies file via vault API

## CSS

All classes prefixed with `tm-`. Uses Tailwind utilities for layout + Obsidian CSS variables for theming.
