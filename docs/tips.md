# Tips and best practices

## Getting more snapshots

File Recovery's default snapshot interval is 2 minutes. If you want more granular history, reduce the interval in **Settings -> Core plugins -> File Recovery**. Keep in mind that shorter intervals use more storage.

## Using hunk restore for selective undo

Instead of restoring an entire version, you can restore individual hunks. This is useful when you want to undo a specific change while keeping other edits. Each hunk in the diff view has its own restore button.

## Keeping the sidebar open

The Time Machine panel stays in sync with your active file. Keep it open in the right sidebar while you work -- it will automatically update as you switch between files.

## Troubleshooting

### "No snapshots found for this file"

This can happen for several reasons:

- **The file is new.** File Recovery needs time to create its first snapshot. Edit the file and wait for the snapshot interval to pass.
- **All snapshots match the current content.** Time Machine hides snapshots identical to the current file. If you recently saved and nothing has changed, there may be no differences to show.
- **Snapshots have expired.** File Recovery deletes snapshots older than the configured history length (default: 7 days).
- **The file exceeds the size limit.** File Recovery skips files larger than the configured maximum (default: 2 MB).

### "File Recovery core plugin is not enabled"

Go to **Settings -> Core plugins** and enable **File Recovery**. Time Machine depends on it entirely for snapshot data.

### The view is empty after switching files

The view should auto-update when you switch files. If it doesn't, close and reopen the panel using the **Time Machine: Open view** command.

### Restore didn't work as expected

Full version restore replaces the entire file content. If you only wanted to undo one specific change, use the per-hunk restore button instead.

After any restore, the view refreshes to show the updated diff. You can continue restoring additional hunks if needed.
