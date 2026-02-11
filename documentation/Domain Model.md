# Domain Model

## FileRecoveryBackup

- `path: string` — vault-relative file path
- `ts: number` — timestamp (epoch ms)
- `data: string` — full file content at snapshot time

## CompareMode

- `'current-vs-version'` — compare current file content against a selected backup
- `'version-vs-version'` — compare two backups against each other

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

## PluginSettings

- `enabled: boolean` — whether the plugin is active
