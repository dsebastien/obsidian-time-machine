---
title: Usage
nav_order: 2
---

# Usage

## Opening the view

Open the command palette (`Ctrl/Cmd + P`) and run **Time Machine: Open view**. The Time Machine panel opens in the right sidebar.

The panel automatically displays snapshots for whichever file is currently active. When you switch to a different file, the view updates automatically.

## The past view

The sidebar is the quick look. The past view is the full one: it opens your note **as it was**, in a pane beside the editor, so you can read an old version on the left while your real, editable note stays on the right. Drag the divider to resize.

Open it with the command **Open past view for current note**, the clock icon in the ribbon, right-click a note in the file explorer, or the history button in the sidebar view's header (which carries your current selection across).

On mobile, or when the window is too narrow to split usefully, it opens as a full-width tab instead.

Once open:

- **Scrub the timeline** at the top to move through versions. Ticks sit where the version actually falls in time, so a flurry of edits looks like a flurry. Versions saved within moments of each other merge into one tick; the arrow keys still step through every single one.
- **Show changes** flips the pane between the old version and the diff.
- **Follow / bind** (the pin button) decides whether the pane stays on this note or follows whatever you open. It stays bound by default.
- **The menu** (⋮) restores the whole version, copies it, or saves it as a new note beside the original.

### Old versions do not run their code

If a version contains a `dataviewjs` or `dataview` block, Time Machine shows it as plain text rather than running it, and tells you how many blocks it skipped.

This is deliberate. Rendering an old version would otherwise execute that code against your vault **as it is today** -- including code you deleted from the note precisely because you did not want it running. If you would rather see those blocks live, turn on **Run code in old versions** in settings.

## Commands

| Command                                                         | Description                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Time Machine: Open view**                                     | Opens the Time Machine panel in the sidebar                                                    |
| **Time Machine: Force file recovery snapshot for current file** | Immediately creates a File Recovery snapshot for the active file, bypassing the interval timer |

## Browsing snapshots

When a file has multiple snapshots with differences from the current content, a **timeline slider** appears at the top of the panel.

- The **left end** of the slider is the most recent snapshot
- The **right end** is the oldest snapshot
- Drag the slider to select a snapshot
- The selected snapshot's date and relative time are displayed below the slider
- Edge labels show the dates of the newest and oldest available snapshots

When there is only one snapshot with differences, the slider is hidden and the diff is shown directly.

### Source indicators

Below the date display, a **source indicator** shows where the selected snapshot comes from:

- **Git branch icon** with commit short hash, message, and author name -- for git commits
- **Clock icon** with "File recovery" -- for File Recovery snapshots

This helps you identify which source each snapshot originates from when both File Recovery and git snapshots are present on the timeline.

### Snapshot filtering and deduplication

Snapshots that are identical to the current file content are automatically hidden. When multiple snapshots from different sources have the same content, only the most recent one is kept. This means:

- The snapshot count in the header reflects only unique snapshots with actual differences
- If you save your file and all snapshots match the current content, the view shows "No snapshots found"
- When you edit the file and re-open the view, previously hidden snapshots may reappear
- A git commit and a File Recovery snapshot with identical content will appear as a single entry (the newer one)

## Reading the diff

By default, the diff view shows what changed between the selected snapshot and your current file content.

### Comparison modes

A **Compare with** toggle at the top of the diff view picks which newer version the selected snapshot is compared against:

- **Current file** (default) -- everything that changed between the selected version and the file as it is now. Scrubbing into the past shows the _cumulative_ drift up to today.
- **Next version** -- only what changed between the selected version and the next newer one, like Obsidian's core File Recovery. Scrubbing steps through the _incremental_ change of each version.

For the newest snapshot both modes show the same thing (its "next version" is the current file). Your last choice is remembered across sessions.

In **Next version** mode the per-hunk restore buttons are hidden: those hunks describe a change between two historical versions, so applying one to the current file would be ambiguous. **Restore entire version** stays available in both modes.

### Diff colors

In the diff itself (reading "old" as the selected snapshot and "new" as whatever it is compared against):

- Lines with a **green background** and `+` prefix are additions (present in current file, not in the snapshot)
- Lines with a **red background** and `-` prefix are removals (present in the snapshot, not in current file)
- Lines with no highlight are context lines (unchanged)

When a line is edited rather than added or removed wholesale, only the **changed words** are highlighted (stronger green/red) within the line, so small edits to a long paragraph no longer show the whole paragraph as removed and re-added.

Each group of related changes is displayed as a **hunk** with a header showing the line range (e.g., `@@ -10,5 +10,7 @@`).

The diff label indicates the source:

- **"Commit a1b2c3d (2026-02-11 14:30)"** for git snapshots
- **"Snapshot (2/11/2026, 2:30:00 PM)"** for File Recovery snapshots

## Restoring content

There are two ways to restore content from a snapshot:

### Restore entire version

Select the **Restore entire version** button at the top of the diff view. This replaces the entire file content with the snapshot's content. A confirmation dialog will ask you to confirm before proceeding.

Restoring from a git snapshot works the same way as restoring from a File Recovery snapshot -- the file content is updated via Obsidian's vault API. No git operations are performed.

### Restore individual hunks

Each hunk has a restore button (rotate icon) in its header. Clicking it applies just that specific change to your current file, without affecting other parts. Hunk restores apply immediately without a confirmation dialog.

## Empty states

The panel shows contextual messages when it cannot display snapshots:

- **"Open a file to see its history"** -- no file is currently active
- **"No snapshots found for this file"** -- the file has no snapshots from any source (or all snapshots are identical to the current content). The hint text notes that snapshots come from File Recovery and git commits.
- **"File Recovery core plugin is not enabled"** -- shown only when File Recovery is disabled and no snapshots were found from other sources (e.g., git). Enable File Recovery in **Settings -> Core plugins**.
