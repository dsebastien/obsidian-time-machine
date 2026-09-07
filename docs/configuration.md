---
title: Configuration
nav_order: 3
---

# Configuration

Time Machine requires **Obsidian 1.13.0 or later**. Its settings pane is built on
the declarative settings API introduced in 1.13; on an older version the plugin
does not load at all.

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
| Enable Git integration | Show Git commits as snapshots on the timeline (desktop only)    | On      |
| Maximum Git commits    | Maximum number of Git commits to fetch per file (slider, 1-200) | 50      |

**Note:** Git integration only works on the desktop app. On mobile, these settings have no effect and no git operations are attempted.

When enabled, Time Machine automatically detects whether the vault is inside a git repository and, for each file, fetches its commit history. The git commits are merged with File Recovery snapshots into a single chronological timeline.

The plugin never creates commits, pushes, pulls, or modifies the git repository in any way. It is strictly read-only.

### External and bare Git repositories

On desktop, Time Machine also supports a vault-root `.git` **file** pointing to an external
Git directory, including a bare repository. This is useful when LiveSync syncs the vault
while Git repository data stays in a sibling folder.

For example:

```text
Obsidian/
  Obsidian-Vault/
    .git
    Note.md
  Vault.git/
```

The `.git` file can contain a relative pointer:

```text
gitdir: ../Vault.git
```

An absolute path is supported too. Use your existing Git setup; Time Machine does not create
or convert repositories. No extra plugin setting is needed beyond **Enable Git integration**.
The vault must have its own valid `.git` entry for bare-repository support, and notes must
exist in the repository's `HEAD` to be treated as tracked when there is no index.

Normal repositories, vaults nested within a normal repository, separate Git directories and
linked worktrees remain supported. A bare repository directory **by itself** is not a note
vault. Time Machine supplies work-tree context to its read commands without changing
`core.bare`, repository configuration, commits or the index. This support applies to the
timeline, past view, and Markdown history export/freeze.

## Past view

| Setting                      | Default | What it does                                                              |
| ---------------------------- | ------- | ------------------------------------------------------------------------- |
| **Enable past view**         | On      | Shows the past view's command, ribbon icon and menu items                 |
| **Open showing changes**     | Off     | Opens the past view on the diff rather than the old version               |
| **Run code in old versions** | Off     | Lets `dataviewjs` and Dataview blocks in an old version run when rendered |

### Run code in old versions

Leave this off unless you have a specific reason.

Rendering an old version normally executes any code it contains -- against your vault as it is **today**, and including blocks you have since deleted from the note. While the setting is off, those blocks are shown as plain source instead, and the pane tells you how many it skipped.
