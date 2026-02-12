# Configuration

## File Recovery settings

Time Machine reads snapshots from the **File Recovery** core plugin. To configure it, go to **Settings -> Core plugins -> File Recovery** and adjust:

| Setting           | Description                                      | Default   |
| ----------------- | ------------------------------------------------ | --------- |
| Snapshot interval | How often File Recovery saves a snapshot         | 2 minutes |
| History length    | How long snapshots are kept before being deleted | 7 days    |
| Maximum file size | Files larger than this are not snapshotted       | 2 MB      |

## Plugin settings

Time Machine has the following settings, accessible via **Settings -> Community plugins -> Time Machine**:

### Git integration

| Setting                | Description                                                     | Default |
| ---------------------- | --------------------------------------------------------------- | ------- |
| Enable git integration | Show git commits as snapshots on the timeline (desktop only)    | On      |
| Maximum git commits    | Maximum number of git commits to fetch per file (slider, 1-200) | 50      |

**Note:** Git integration only works on the desktop app. On mobile, these settings have no effect and no git operations are attempted.

When enabled, Time Machine automatically detects whether the vault is inside a git repository and, for each file, fetches its commit history. The git commits are merged with File Recovery snapshots into a single chronological timeline.

The plugin never creates commits, pushes, pulls, or modifies the git repository in any way. It is strictly read-only.
