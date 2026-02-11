# Configuration

## Prerequisites

Time Machine requires the **File Recovery** core plugin to be enabled. This is the source of all snapshots.

To configure File Recovery, go to **Settings -> Core plugins -> File Recovery** and adjust:

| Setting           | Description                                      | Default   |
| ----------------- | ------------------------------------------------ | --------- |
| Snapshot interval | How often File Recovery saves a snapshot         | 2 minutes |
| History length    | How long snapshots are kept before being deleted | 7 days    |
| Maximum file size | Files larger than this are not snapshotted       | 2 MB      |

## Plugin settings

Time Machine itself currently has no configurable settings. It works out of the box once File Recovery is enabled.

The settings tab provides links to follow the author and support the plugin.
