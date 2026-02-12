# Usage

## Opening the view

Open the command palette (`Ctrl/Cmd + P`) and run **Time Machine: Open view**. The Time Machine panel opens in the right sidebar.

The panel automatically displays snapshots for whichever file is currently active. When you switch to a different file, the view updates automatically.

## Commands

| Command                     | Description                                 |
| --------------------------- | ------------------------------------------- |
| **Time Machine: Open view** | Opens the Time Machine panel in the sidebar |

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

The diff view shows what changed between the selected snapshot and your current file content.

- Lines with a **green background** and `+` prefix are additions (present in current file, not in the snapshot)
- Lines with a **red background** and `-` prefix are removals (present in the snapshot, not in current file)
- Lines with no highlight are context lines (unchanged)

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
