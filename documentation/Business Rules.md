# Business Rules

This document defines the core business rules. These rules MUST be respected in all implementations unless explicitly approved otherwise.

---

## Documentation Guidelines

When a new business rule is mentioned:

1. Add it to this document immediately
2. Use a concise format (single line or brief paragraph)
3. Maintain precision - do not lose important details for brevity
4. Include rationale where it adds clarity

---

## File Recovery Dependency

The plugin requires the File Recovery core plugin to be enabled. If not available, a Notice is shown and the view displays an appropriate empty state. However, if git integration is available, the view proceeds with git-only snapshots instead of blocking.

## Restore Safety

Full version restore requires user confirmation via a modal dialog. Hunk restores apply immediately without confirmation. **Hunk restore is unavailable in `next` comparison mode**: the displayed hunks relate two historical versions, so their line numbers and content are not addressed against the current file. The button is hidden in that mode and `handleRestoreHunk` refuses to run as a second guard. Full version restore stays available in both modes (it writes the selected snapshot wholesale).

## View Behavior

The Time Machine view opens in the right sidebar. It auto-updates when switching files via the `file-open` event, and also follows the text cursor: a debounced `selectionchange`/`active-leaf-change` handler resolves the focused editor's file and switches the view to the note the cursor is in. **Cursor-following resolves ONLY `workspace.activeEditor.file` — never `getActiveFile()`**: notes rendered in a continuous-scroll pane are never "opened" in a leaf, so `getActiveFile()` reports the most recently opened file, which in a split is the other pane's note; falling back to it made interacting with the Time Machine pane switch the view to the wrong note (issue #7). The `getActiveFile()` fallback is allowed only for the initial file when the view first opens. This supports continuous-scroll plugins (e.g. Daily Notes Editor) that render multiple notes in one leaf where `file-open` does not fire. Cursor-following never clears the view when no file resolves (focus moved to the sidebar/the view itself), and is suppressed entirely while focus is inside the Time Machine view (e.g. dragging its slider) so interacting with the pane never switches the displayed file. It refreshes when the current file is modified (debounced at 1 second). Snapshots are periodically re-fetched from IndexedDB at the file-recovery `intervalMinutes` rate (only when views are open). Users open it manually via the "Open view" command.

## Snapshot Ordering

Snapshots are always sorted descending by timestamp (newest first), regardless of source.

## Compare Mode

Users select snapshots via a timeline slider. Two comparison modes decide which newer version the selected snapshot is diffed against, toggled in the diff toolbar and persisted to settings (`diffComparisonMode`):

- **`current` (default)**: selected snapshot → live file content. Shows the cumulative drift from that point to now.
- **`next`**: selected snapshot → the chronologically next (newer) snapshot, per the _filtered_ `snapshots` array so indices stay aligned with the slider. The newest snapshot's "next" is the current file content, so both modes agree at the newest position and there is no missing-"next" edge case.

## Diff Rendering

Diffs are line-based (unified hunks, 3 lines of context) so per-hunk restore stays line-addressable, but each modified line additionally shows **word-level** inline highlighting (via `diffWordsWithSpace`): only the changed words are tinted, not the whole line. Line endings are normalized (CRLF→LF) before diffing so a line-ending mismatch between a snapshot and the current file does not report every line as changed. The diff library's `\ No newline at end of file` marker is stripped from rendered output.

## Timeline Slider

The slider maps left=newest, right=oldest. It auto-selects the newest snapshot on render and fires diff computation on each change. The slider is hidden when only one snapshot exists (just the date info and diff are shown).

## Snapshot Filtering

Snapshots identical to the current file content are filtered out at render time. If all snapshots are filtered out, the "no snapshots" empty state is shown. Filtering is re-evaluated each time the view updates for a file, including on file modification.

## Snapshot Deduplication

When multiple snapshots (across any source) have identical content, only the most recent one is kept. Deduplication runs after merging and sorting, so the newest snapshot per unique content always wins.

## Git Integration

Git integration is desktop-only; it degrades gracefully on mobile with zero overhead. The plugin never creates commits or modifies the git repository (read-only). Restore from a git snapshot uses `vault.modify()`, identical to file-recovery restore. Git and file-recovery snapshots are merged chronologically on the same timeline. `gitMaxCommits` limits commits fetched per file (default 50). Files not tracked by git produce no git snapshots (no error). The view is not blocked when file-recovery is disabled if git snapshots are available. The settings tab shows a live git availability status (mobile / git not detected / repository detected) so users can tell why no git snapshots appear even when the toggle is on.

## Past View

The past view (`time-machine-past-view`) shows a note as it was at a chosen version, read-only. It opens via `createLeafBySplit(editorLeaf, 'vertical', true)`, which inserts it **before** the leaf showing the file — visually left in standard LTR layouts. `createLeafBySplit` documents neither geometry nor sizing, so this is observed behaviour, not contract: RTL and stacked-tab layouts may place it differently, and a restored layout keeps its saved pane sizes rather than 50/50. On mobile, or when the workspace is narrower than 700px, it opens as a tab instead — the full-width past view.

**The live file is never written to for display purposes.** Swapping the real editor's content to show an old version would dirty the file, fire `modify`, and pollute file-recovery with versions the user never typed.

A past view is **bound** to its file by default and does not follow the active file; a header toggle switches it to following. "Bound" is deliberately not called "pinned": `ViewState.pinned` is Obsidian's own leaf pinning (the leaf is not reused for navigation) and is set independently — the launcher sets it so the leaf is not recycled.

Only one past view per file: `openPastView` reveals an existing one instead of opening a second. Existing views are detected via `leaf.getViewState()`, not `leaf.view`, because a deferred leaf exposes a `DeferredView` placeholder until activated.

With no snapshots, the timeline, diff toggle, comparison control and actions do not render at all — only the empty state. A restored view whose file was deleted or renamed shows an empty state rather than crashing.

## Rendering Historical Versions

`MarkdownRenderer.render` runs every registered markdown post-processor, so rendering a historical version would execute any `dataviewjs` (arbitrary JavaScript) and Dataview queries in it — against the vault as it is today, including blocks the user has since deleted from the note. There is no safe mode on the API, and sanitising the rendered DOM afterwards is useless because execution has already happened.

Executable fenced blocks are therefore **neutralised before rendering**: `neutraliseExecutableBlocks` relabels them to `text` so they display as source, and raw `<script>` tags are escaped. The view shows how many blocks it defused rather than doing it silently. `pastViewExecuteBlocks` (default `false`) opts back into full execution.

The rendered output is historical _source_ rendered against the _current_ vault: embeds, links, Dataview results and metadata all resolve to the vault as it is now, not as it was.

## Selection Identity

Snapshot selection is tracked by snapshot **id**, never by index — indices shift as snapshots arrive, are deduplicated, or are filtered against the current content. The snapshot's timestamp is persisted alongside the id so that when the selected snapshot disappears (dedup, filtering, or a restart), the selection falls back to the nearest surviving snapshot in time. On a tie the newer snapshot wins.

## Async Result Ordering

Every asynchronous operation in `SnapshotSession` captures a monotonic generation on entry and discards its results if a newer operation started meanwhile. Snapshot fetching shells out to git once per commit and can take seconds, so without this a slow fetch for one file could land after — and overwrite — a newer fetch for another.

## Snapshot Fetch Coalescing

Concurrent snapshot fetches for the same (path, git settings) share one request via `SnapshotCache`. Each fetch runs one `git show` per commit up to `gitMaxCommits`, so a sidebar view plus a past view on the same note would otherwise double it. Nothing is cached across ticks: snapshots change underneath the plugin, and stale history is worse than a slow fetch.

## Comparison Mode Propagation

`diffComparisonMode` is a single shared setting. All changes go through `plugin.setComparisonMode`, which persists it and notifies every open history view. A view must never write the setting directly, or two open views end up disagreeing about the mode they are both supposedly reading.

## Note Creation

"Open this version as a new note" is the only place the plugin creates a file. It writes `<basename> (yyyy-MM-dd HH-mm).md` beside the original with no prompt. `vault.create` rejects when the path exists, so collisions are handled by catching and retrying with a numeric suffix rather than checking existence first — a pre-check races against anything else writing to the vault.
