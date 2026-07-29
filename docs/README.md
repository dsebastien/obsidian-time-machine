---
title: Overview
nav_order: 1
permalink: /
---

# Time Machine

Browse, compare, and restore previous versions of your notes using Obsidian's built-in file-recovery snapshots and git commits.

## Key features

- **Timeline slider** to scrub through snapshots of your notes
- **Colored diff view** showing exactly what changed between a snapshot and your current file
- **Selective restore** -- restore an entire version or just individual changes (hunks)
- **Git integration** -- git commits appear alongside File Recovery snapshots on the same timeline (desktop only)
- **Source indicators** -- each snapshot shows its origin (File Recovery or git commit with hash and message)
- **Smart deduplication** -- identical snapshots across sources are merged, keeping only the most recent
- **On-demand snapshots** -- force-create a File Recovery snapshot at any time via command
- **Auto-updates** when you switch files -- no manual refresh needed
- Works on **desktop and mobile** (git features are desktop-only)

## Quick start

1. Make sure the **File Recovery** core plugin is enabled in **Settings -> Core plugins**
2. Install and enable Time Machine
3. Open the command palette and run **Time Machine: Open view**
4. The sidebar panel shows snapshots for the active file -- use the slider to browse them

If your vault is a git repository, git commits will automatically appear on the timeline alongside File Recovery snapshots.

## Snapshot sources

Time Machine reads from two sources:

- **File Recovery** -- Obsidian's built-in core plugin that automatically saves snapshots at a configurable interval (default: every 2 minutes). Works on all platforms.
- **Git** -- If your vault is inside a git repository and you're on desktop, Time Machine fetches the commit history for each file. This is read-only; Time Machine never creates commits or modifies the repository.

If File Recovery is disabled, Time Machine will show a notice but still work if git is available. If neither source has data for a file, an empty state message is shown.

## About

Created by [Sebastien Dubois](https://dsebastien.net).

[Buy me a coffee](https://www.buymeacoffee.com/dsebastien) to support development.

<!-- support-cta -->
## News & support

To stay up to date about this plugin, Obsidian in general, Personal Knowledge Management and note-taking:

- Subscribe to [my newsletter](https://dsebastien.net/newsletter)
- Subscribe to [my YouTube channel](https://youtube.com/@dsebastien)
- Join the [Knowii community](https://www.store.dsebastien.net/product/knowii-community/) and learn to organize your notes and put your knowledge to work, together with fellow knowledge workers

If this plugin is useful to you, here are the best ways to support my work ❤️:

- [Join the Knowii community](https://www.store.dsebastien.net/product/knowii-community/)
- [Become a GitHub Sponsor](https://github.com/sponsors/dsebastien)
- [Buy me a coffee](https://www.buymeacoffee.com/dsebastien)
- [Subscribe to my YouTube channel](https://youtube.com/@dsebastien)
- [Check out my products](https://store.dsebastien.net)
