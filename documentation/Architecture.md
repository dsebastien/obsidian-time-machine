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
- **SnapshotCache**: coalesces concurrent snapshot fetches per (path, git settings). Several open views on one note would otherwise each run one `git show` per commit.
- **NoteExportService**: writes a historical version out as a new note beside the original. The only place the plugin creates a file.
- **past-view-launcher.ts**: `openPastView` — resolves the root leaf showing the file, splits before it, reuses an existing past view (detected via `leaf.getViewState()`, since deferred leaves expose a `DeferredView`).

### Domain

- **backup.ts**: Sorting, date formatting (date-fns), relative time
- **snapshot.ts**: Factory functions (`fileRecoveryToSnapshot`, `gitCommitToSnapshot`), merge/sort utilities, label formatting
- **snapshot-session.ts**: `SnapshotSession` — the state behind a history view (file, snapshots, selection, diff). Shared by both views. Selection is by snapshot **id**, not index. Every async operation is generation-guarded so a slow git fetch cannot overwrite fresher results.
- **timeline-layout.ts**: pure layout maths for the timeline (proportional positioning, clustering, tier selection, keyboard stepping). No DOM, so it is directly unit-testable.
- **markdown-safety.ts**: `neutraliseExecutableBlocks` — relabels executable fenced blocks to `text` before a historical version reaches `MarkdownRenderer`, so old `dataviewjs`/`dataview` blocks display as source instead of executing.
- **past-view-state.ts**: `PastViewState` and its normaliser for untrusted workspace-layout state.

### Types

- **snapshot.intf.ts**: Unified `Snapshot` type with `SnapshotSource` (`'file-recovery' | 'git'`), `FileRecoveryMetadata`, `GitMetadata`
- **backup.intf.ts**: `FileRecoveryBackup` (used internally by FileRecoveryService)
- **diff.intf.ts**: `DiffResult`, `DiffHunk`
- **plugin-settings.intf.ts**: `PluginSettings` with git integration settings

### UI

Two views, one shared core. Both implement `HistoryView` so the plugin routes to them by capability rather than by concrete class.

- **TimeMachineView**: ItemView in the right sidebar. Compact surface; always follows the active file.
- **PastView**: main-area ItemView showing a note as it was at a chosen version. Opened in a native split _before_ the leaf holding the live editor (visually left in LTR), so the right pane stays the user's real, editable note. Opens as a tab on mobile or in a narrow workspace. Bound to its file by default.
- **TimelineBarComponent**: controlled timeline; ticks positioned proportionally to timestamp, clustering for dense histories, keyboard stepping, responsive tiers via `onResize`. Renders the selection it is given and never auto-selects — the session owns selection. Replaces the old `TimelineSliderComponent`.
- **DiffViewerComponent**: diff body and per-hunk restore only. The comparison control and full-restore button belong to the owning view's header.
- **renderComparisonModeControl / renderRestoreFullButton**: shared header controls.
- **EmptyState**: Contextual empty messages
- **ConfirmModal** (`components/confirm-modal.ts`): shared confirmation; settles exactly once, so an Escape dismissal resolves as cancel.

## Data Flow

1. File-open event → plugin routes to every view whose `followsActiveFile()` is true → `updateForFile(file)`
2. `SnapshotSession` fetches via `SnapshotCache` (coalescing) → `SnapshotService.getSnapshots()` (file-recovery + git if enabled)
3. Filter out snapshots identical to current file content; reconcile the selection (same id, else nearest surviving timestamp, else newest)
4. User scrubs the timeline → session computes the diff for the selection under the active comparison mode
5. Sidebar renders the diff; the past view renders either the diff or the neutralised markdown of the old version
6. User clicks restore → RestoreService modifies the file via the vault API (same for both sources)

Comparison-mode changes go through `plugin.setComparisonMode`, which saves the setting and broadcasts to every open history view.

## CSS

All classes prefixed with `tm-`. Uses Tailwind v4 utilities (no preflight/reset) for layout + Obsidian CSS variables for theming. All plugin styles isolated in `@layer components`.
