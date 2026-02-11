# Time Machine for Obsidian

Ever accidentally deleted a paragraph, overwrote a section, or wished you could see what your note looked like an hour ago? **Time Machine** gives you instant access to every snapshot Obsidian has silently saved for you.

<img width="1830" height="933" alt="screenshot-2026-02-11_10-50-56" src="https://github.com/user-attachments/assets/0c6afa48-f4e9-4e77-a544-cd4d92155905" />


## What it does

Time Machine turns Obsidian's built-in File Recovery snapshots into a visual, interactive timeline. Scrub through your note's history with a slider, see exactly what changed, and restore anything -- an entire version or just a single paragraph.

## Features

- **Timeline slider** -- drag through your note's history to see how it evolved over time
- **Colored diff view** -- additions in green, deletions in red, so you can instantly spot what changed
- **Full version restore** -- roll back your entire note to any previous snapshot
- **Selective restore** -- restore just the specific changes you want, leaving the rest untouched
- **Auto-sync** -- the view updates automatically when you switch between files
- **Zero configuration** -- works immediately with Obsidian's built-in File Recovery, no setup needed
- **Smart filtering** -- only shows snapshots that actually differ from your current content
- **Desktop and mobile** -- works wherever Obsidian runs

## Getting started

1. Enable the **File Recovery** core plugin in **Settings -> Core plugins** (it's usually on by default)
2. Install Time Machine from the Community Plugins browser
3. Open the command palette (`Ctrl/Cmd + P`) and run **Time Machine: Open view**
4. Start browsing your note's history

## How it works

Obsidian's File Recovery core plugin automatically saves snapshots of your notes at regular intervals (every 2 minutes by default). Time Machine reads these snapshots and presents them as an interactive timeline with diff visualization.

You don't need to do anything special -- just write your notes as usual. Time Machine will always have your history ready when you need it.

## Documentation

- [Usage guide](docs/usage.md) -- how to browse, compare, and restore snapshots
- [Configuration](docs/configuration.md) -- adjusting File Recovery settings
- [Tips and troubleshooting](docs/tips.md) -- common questions and solutions

## Support

Created by [Sebastien Dubois](https://dsebastien.net).

If you find this plugin useful, consider [buying me a coffee](https://www.buymeacoffee.com/dsebastien) to support development.

## License

MIT
