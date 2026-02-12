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

Full version restore requires user confirmation via a modal dialog. Hunk restores apply immediately without confirmation.

## View Behavior

The Time Machine view opens in the right sidebar. It auto-updates when switching files via the `file-open` event and refreshes when the current file is modified (debounced at 1 second). Snapshots are periodically re-fetched from IndexedDB at the file-recovery `intervalMinutes` rate (only when views are open). Users open it manually via the "Open view" command.

## Snapshot Ordering

Snapshots are always sorted descending by timestamp (newest first), regardless of source.

## Compare Mode

The plugin compares the live file content against a selected snapshot (current vs version). Users select snapshots via a timeline slider.

## Timeline Slider

The slider maps left=newest, right=oldest. It auto-selects the newest snapshot on render and fires diff computation on each change. The slider is hidden when only one snapshot exists (just the date info and diff are shown).

## Snapshot Filtering

Snapshots identical to the current file content are filtered out at render time. If all snapshots are filtered out, the "no snapshots" empty state is shown. Filtering is re-evaluated each time the view updates for a file, including on file modification.

## Snapshot Deduplication

When multiple snapshots (across any source) have identical content, only the most recent one is kept. Deduplication runs after merging and sorting, so the newest snapshot per unique content always wins.

## Git Integration

Git integration is desktop-only; it degrades gracefully on mobile with zero overhead. The plugin never creates commits or modifies the git repository (read-only). Restore from a git snapshot uses `vault.modify()`, identical to file-recovery restore. Git and file-recovery snapshots are merged chronologically on the same timeline. `gitMaxCommits` limits commits fetched per file (default 50). Files not tracked by git produce no git snapshots (no error). The view is not blocked when file-recovery is disabled if git snapshots are available.
