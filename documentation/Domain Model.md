# Domain Model

## Snapshot (unified)

- `id: string` — unique identifier: `"fr-{ts}"` for file-recovery, `"git-{hash}"` for git
- `path: string` — vault-relative file path
- `ts: number` — timestamp (epoch ms)
- `data: string` — full file content at snapshot time
- `source: SnapshotSource` — `'file-recovery'` or `'git'`
- `metadata: SnapshotMetadata` — source-specific metadata

## FileRecoveryMetadata

- `source: 'file-recovery'`

## GitMetadata

- `source: 'git'`
- `commitHash: string` — full commit hash
- `shortHash: string` — first 7 chars
- `commitMessage: string` — first line of commit message
- `authorName: string`

## FileRecoveryBackup (internal)

- `path: string` — vault-relative file path
- `ts: number` — timestamp (epoch ms)
- `data: string` — full file content at snapshot time

## GitCommitInfo (internal)

- `hash: string` — full commit hash
- `shortHash: string` — abbreviated hash
- `authorName: string`
- `authorDateUnix: number` — unix timestamp in seconds
- `subject: string` — first line of commit message

## DiffResult

- `oldHeader: string` — label for the old version
- `newHeader: string` — label for the new version
- `hunks: DiffHunk[]` — list of change hunks

## DiffHunk

- `oldStart: number` — starting line in old version
- `oldLines: number` — count of lines in old version
- `newStart: number` — starting line in new version
- `newLines: number` — count of lines in new version
- `lines: string[]` — diff lines prefixed with `+`, `-`, or ` ` (context)

## PastViewState

Persisted in the workspace layout; normalised on load because `View.setState` receives `unknown`.

- `filePath: string | null` — vault path of the note being inspected
- `boundToFile: boolean` — stay on `filePath` regardless of the active file (default: true)
- `snapshotId: string | null` — selected snapshot
- `snapshotTimestamp: number | null` — timestamp of the selection, so it can fall back to the nearest survivor after a restart
- `showDiff: boolean` — body shows the diff rather than the rendered version

## SnapshotSession

Shared state behind a history view.

- `file: TFile | null`
- `allSnapshots: Snapshot[]` — everything fetched
- `snapshots: Snapshot[]` — those that actually differ from the current content
- `diffBaseContent: string | null` — the content the rendered diff was computed against; hunk restore is addressed to it
- selection held as id + timestamp, exposed via `selectedSnapshot` / `selectedIndex`

## TimelineTick

- `ids: string[]` — snapshots represented, newest first (more than one when clustered)
- `position: number` — 0 = left/newest, 1 = right/oldest
- `ts: number` — timestamp of the representative snapshot
- `source: SnapshotSource | 'mixed'`
- `cluster: boolean`

## PluginSettings

- `gitIntegrationEnabled: boolean` — whether git commits are shown (default: true)
- `gitMaxCommits: number` — max commits per file (default: 50)
- `pastViewEnabled: boolean` — past view and its entry points available (default: true)
- `pastViewDefaultShowDiff: boolean` — past view opens on the diff (default: false)
- `pastViewExecuteBlocks: boolean` — allow executable blocks in old versions to run (default: false)
