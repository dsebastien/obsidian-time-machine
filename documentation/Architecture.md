# Architecture

## Plugin Structure

Time Machine is a sidebar ItemView plugin that reads snapshots from multiple sources (Obsidian's file-recovery IndexedDB and git commits) and presents them on a unified timeline with diff visualization and selective restore.

## Layers

### Plugin (`plugin.ts`)

- Lifecycle management (onload/onunload)
- Checks file-recovery availability
- Registers view, commands (open view, force snapshot), settings, file-open event

### Services

- **FileRecoveryService**: Reads from `app.internalPlugins.getEnabledPluginById('file-recovery').db` IndexedDB
- **GitService**: Desktop-only git operations via `child_process.execFile`. Checks availability, fetches commit history, retrieves file content at specific commits. All methods static, fail gracefully.
- **SnapshotService**: Orchestrator that fetches from both sources (file-recovery + git), converts to unified `Snapshot` type, and merges chronologically.
- **DiffService**: Wraps `diff` (jsdiff) `structuredPatch` for computing diffs
- **RestoreService**: Full version restore via `vault.modify()` + selective hunk restoration via line manipulation

### Domain

- **backup.ts**: Sorting, date formatting (date-fns), relative time
- **snapshot.ts**: Factory functions (`fileRecoveryToSnapshot`, `gitCommitToSnapshot`), merge/sort utilities, label formatting

### Types

- **snapshot.intf.ts**: Unified `Snapshot` type with `SnapshotSource` (`'file-recovery' | 'git'`), `FileRecoveryMetadata`, `GitMetadata`
- **backup.intf.ts**: `FileRecoveryBackup` (used internally by FileRecoveryService)
- **diff.intf.ts**: `DiffResult`, `DiffHunk`
- **plugin-settings.intf.ts**: `PluginSettings` with git integration settings

### UI

- **TimeMachineView**: ItemView in right sidebar, orchestrates components. Uses `SnapshotService` to fetch unified snapshots.
- **TimelineSliderComponent**: Range input slider (left=newest, right=oldest) with filled track, edge date labels, inline selected date display, source indicator (git-branch/clock icon), auto-select newest; hidden when only one snapshot
- **DiffViewerComponent**: Colored diff hunks with per-hunk restore buttons
- **EmptyState**: Contextual empty messages
- **ConfirmModal**: Confirmation for full restore only

## Data Flow

1. File-open event → `updateForFile(file)`
2. Fetch snapshots from all sources via `SnapshotService.getSnapshots()` (file-recovery + git if enabled)
3. Filter out snapshots identical to current file content
4. User scrubs timeline slider → compute diff (current vs selected snapshot) via DiffService
5. Render diff in DiffViewerComponent with source-aware labels
6. User clicks restore → RestoreService modifies file via vault API (same for both sources)

## CSS

All classes prefixed with `tm-`. Uses Tailwind v4 utilities (no preflight/reset) for layout + Obsidian CSS variables for theming. All plugin styles isolated in `@layer components`.
