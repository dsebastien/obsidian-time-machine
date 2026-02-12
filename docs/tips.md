# Tips and best practices

## Getting more snapshots

File Recovery's default snapshot interval is 2 minutes. If you want more granular history, reduce the interval in **Settings -> Core plugins -> File Recovery**. Keep in mind that shorter intervals use more storage.

If your vault is a git repository, committing frequently gives you additional snapshots on the timeline alongside File Recovery's automatic ones.

## Using hunk restore for selective undo

Instead of restoring an entire version, you can restore individual hunks. This is useful when you want to undo a specific change while keeping other edits. Each hunk in the diff view has its own restore button.

## Keeping the sidebar open

The Time Machine panel stays in sync with your active file. Keep it open in the right sidebar while you work -- it will automatically update as you switch between files.

## Git integration tips

- Git integration is **read-only** -- Time Machine never creates commits, pushes, or modifies your repository
- The `--follow` flag is used when fetching git history, so renames are tracked
- If a file is not tracked by git, only File Recovery snapshots are shown (no error)
- Reduce the "Maximum git commits" setting if loading is slow for files with long histories
- Git integration only works on **desktop**; on mobile, only File Recovery snapshots are shown

## Troubleshooting

### "No snapshots found for this file"

This can happen for several reasons:

- **The file is new.** File Recovery needs time to create its first snapshot. Edit the file and wait for the snapshot interval to pass. If using git, make your first commit.
- **All snapshots match the current content.** Time Machine hides snapshots identical to the current file. If you recently saved and nothing has changed, there may be no differences to show.
- **Snapshots have expired.** File Recovery deletes snapshots older than the configured history length (default: 7 days). Git commits, however, are permanent.
- **The file exceeds the size limit.** File Recovery skips files larger than the configured maximum (default: 2 MB). Git snapshots are still shown for large files.
- **The file is not tracked by git.** Only files committed to git produce git snapshots. Untracked or gitignored files will only have File Recovery snapshots.

### "File Recovery core plugin is not enabled"

Go to **Settings -> Core plugins** and enable **File Recovery**. This message only appears when File Recovery is disabled **and** no snapshots were found from git either. If your vault is a git repository and the file has commits, Time Machine will still work without File Recovery.

### No git snapshots appearing

- Make sure git is installed and available on your system (`git --version` in a terminal)
- Verify your vault is inside a git repository (look for a `.git` folder)
- Check that the file has been committed at least once
- Confirm that "Enable git integration" is turned on in the Time Machine settings
- Git integration is desktop-only -- it does not work on mobile

### The view is empty after switching files

The view should auto-update when you switch files. If it doesn't, close and reopen the panel using the **Time Machine: Open view** command.

### Restore didn't work as expected

Full version restore replaces the entire file content. If you only wanted to undo one specific change, use the per-hunk restore button instead.

Restoring from a git snapshot works identically to restoring from a File Recovery snapshot -- the file is updated through Obsidian's vault API. No git operations (like `git checkout` or `git revert`) are performed.

After any restore, the view refreshes to show the updated diff. You can continue restoring additional hunks if needed.
