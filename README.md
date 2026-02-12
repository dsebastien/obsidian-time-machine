# Time Machine for Obsidian

Ever accidentally deleted a paragraph, overwrote a section, or wished you could see what your note looked like an hour ago? **Time Machine** gives you instant access to every snapshot Obsidian has silently saved for you -- plus your git history if your vault is in a repository.

<img width="1830" height="933" alt="screenshot-2026-02-11_10-50-56" src="https://github.com/user-attachments/assets/0c6afa48-f4e9-4e77-a544-cd4d92155905" />

## What it does

Time Machine turns Obsidian's built-in File Recovery snapshots and git commits into a visual, interactive timeline. Scrub through your note's history with a slider, see exactly what changed, and restore anything -- an entire version or just a single paragraph.

## Features

- **Timeline slider** -- drag through your note's history to see how it evolved over time
- **Colored diff view** -- additions in green, deletions in red, so you can instantly spot what changed
- **Full version restore** -- roll back your entire note to any previous snapshot
- **Selective restore** -- restore just the specific changes you want, leaving the rest untouched
- **Git integration** -- automatically shows git commits alongside File Recovery snapshots on the same timeline (desktop only)
- **Source indicators** -- each snapshot shows whether it comes from File Recovery or a git commit
- **On-demand snapshots** -- force-create a File Recovery snapshot whenever you want, without waiting for the timer
- **Auto-sync** -- the view updates automatically when you switch between files
- **Smart filtering** -- only shows snapshots that actually differ from your current content, with duplicates removed
- **Desktop and mobile** -- works wherever Obsidian runs (git features are desktop-only)

## Getting started

1. Enable the **File Recovery** core plugin in **Settings -> Core plugins** (it's usually on by default)
2. Install Time Machine from the Community Plugins browser
3. Open the command palette (`Ctrl/Cmd + P`) and run **Time Machine: Open view**
4. Start browsing your note's history

If your vault is a git repository, Time Machine will automatically include git commits on the timeline -- no extra setup needed.

## How it works

Time Machine reads snapshots from two sources:

- **File Recovery** (always) -- Obsidian's core plugin that automatically saves snapshots at regular intervals (every 2 minutes by default)
- **Git** (desktop, optional) -- if your vault lives in a git repository, Time Machine fetches the commit history for each file

Both sources are merged into a single chronological timeline. Snapshots with identical content are deduplicated, keeping only the most recent one.

You don't need to do anything special -- just write your notes as usual. Time Machine will always have your history ready when you need it.

## Documentation

- [Usage guide](docs/usage.md) -- how to browse, compare, and restore snapshots
- [Configuration](docs/configuration.md) -- plugin settings and File Recovery configuration
- [Tips and troubleshooting](docs/tips.md) -- common questions and solutions

## Support

Created by [Sebastien Dubois](https://dsebastien.net).

If you find this plugin useful, consider [buying me a coffee](https://www.buymeacoffee.com/dsebastien) to support development.

## License

MIT
