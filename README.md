# Time Machine for Obsidian

Ever accidentally deleted a paragraph, overwrote a section, or wished you could see what your note looked like an hour ago? **Time Machine** gives you instant access to every snapshot Obsidian has silently saved for you -- plus your git history if your vault is in a repository.

<img width="1830" height="933" alt="screenshot-2026-02-11_10-50-56" src="https://github.com/user-attachments/assets/0c6afa48-f4e9-4e77-a544-cd4d92155905" />

## What it does

Time Machine turns Obsidian's built-in File Recovery snapshots and git commits into a visual, interactive timeline. Scrub through your note's history with a slider, see exactly what changed, and restore anything -- an entire version or just a single paragraph.

## Features

- **Timeline slider** -- drag through your note's history to see how it evolved over time
- **Colored diff view** -- additions in green, deletions in red, so you can instantly spot what changed
- **Comparison modes** -- diff the selected version against the current file (cumulative) or against the next version (step by step, like core File Recovery)
- **Full version restore** -- roll back your entire note to any previous snapshot
- **Selective restore** -- restore just the specific changes you want, leaving the rest untouched
- **Git integration** -- automatically shows git commits alongside File Recovery snapshots on the same timeline (desktop only)
- **Source indicators** -- each snapshot shows whether it comes from File Recovery or a git commit
- **On-demand snapshots** -- force-create a File Recovery snapshot whenever you want, without waiting for the timer
- **Auto-sync** -- the view updates automatically when you switch between files
- **Smart filtering** -- only shows snapshots that actually differ from your current content, with duplicates removed
- **Desktop and mobile** -- works wherever Obsidian runs (git features are desktop-only)

## Installation

### Community plugins (recommended)

1. In Obsidian, go to **Settings → Community plugins**.
2. Disable **Restricted mode** if it's enabled.
3. Select **Browse**, search for **Time Machine**, install it, then enable it.

You can also browse the catalog on the [Obsidian Community](https://community.obsidian.md/) website.

### Manual installation

If the plugin isn't listed in the community catalog yet (or you want a specific version):

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/dsebastien/obsidian-time-machine/releases).
2. Copy them into `<Vault>/.obsidian/plugins/time-machine/`.
3. Reload Obsidian and enable **Time Machine** in **Settings → Community plugins**.

### BRAT (bleeding edge)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) installs plugins straight from a GitHub repo and keeps them updated automatically. Use this if you want the latest commits — **things might break**.

1. Install **Obsidian42 - BRAT** from **Settings → Community plugins → Browse** and enable it.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Paste `https://github.com/dsebastien/obsidian-time-machine`.
4. Select the latest version and confirm.
5. Enable **Time Machine** in **Settings → Community plugins**.

## Getting started

1. Enable the **File Recovery** core plugin in **Settings -> Core plugins** (it's usually on by default)
2. Install Time Machine (see [Installation](#installation) above).
3. Open the command palette (`Ctrl/Cmd + P`) and run **Time Machine: Open view**
4. Start browsing your note's history

If your vault is a git repository, Time Machine will automatically include git commits on the timeline -- no extra setup needed.

## How it works

Time Machine reads snapshots from two sources:

- **File Recovery** (always) -- Obsidian's core plugin that automatically saves snapshots at regular intervals (every 2 minutes by default)
- **Git** (desktop, optional) -- if your vault lives in a git repository, Time Machine fetches the commit history for each file
- **What's new after updates.** After a plugin update, a one-time dialog shows the release notes you just received (including skipped versions) with ways to support development. Never shown on fresh installs or regular restarts.

Both sources are merged into a single chronological timeline. Snapshots with identical content are deduplicated, keeping only the most recent one.

You don't need to do anything special -- just write your notes as usual. Time Machine will always have your history ready when you need it.

## Documentation

- [Usage guide](docs/usage.md) -- how to browse, compare, and restore snapshots
- [Configuration](docs/configuration.md) -- plugin settings and File Recovery configuration
- [Tips and troubleshooting](docs/tips.md) -- common questions and solutions

## License

MIT

<!-- other-plugins:start -->

## My other Obsidian plugins

| Plugin                                                                                                        | What it does                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Agentic Resource Discovery Server](https://github.com/dsebastien/obsidian-agentic-resource-discovery-server) | Local-first Agentic Resource Discovery publisher and registry that serves your AI skills and tools to agents over a local HTTP and MCP server |
| [Book Exporter](https://github.com/dsebastien/obsidian-book-exporter)                                         | Export books (one manifest note + linked chapter notes) to EPUB and PDF via Pandoc                                                            |
| [Bookshelf Base](https://github.com/dsebastien/obsidian-bookshelf)                                            | Display your notes as a visual bookshelf via a custom Bases view                                                                              |
| [Dataview Serializer](https://github.com/dsebastien/obsidian-dataview-serializer)                             | Serialize Dataview queries to Markdown, and keep the Markdown representation up to date                                                       |
| [Expander](https://github.com/dsebastien/obsidian-expander)                                                   | Replace variables across your vault using HTML comment markers. Supports static values and dynamic functions                                  |
| [Ghost Publish](https://github.com/dsebastien/obsidian-ghost-publish)                                         | Publish your vault notes to a Ghost blog with configurable presets for tags, newsletters, and frontmatter conventions                         |
| [Graph Explorer Base View](https://github.com/dsebastien/obsidian-graph-explorer-base-view)                   | A custom Bases view that renders notes as an interactive force-directed graph with explored/unexplored tracking                               |
| [Hidden Folders Access](https://github.com/dsebastien/obsidian-hidden-folders-access)                         | Index hidden root-level folders (e.g. .claude) so they appear in the file tree, metadata cache, and Bases                                     |
| [Journal Bases](https://github.com/dsebastien/obsidian-journal-base)                                          | Custom Base views for journaling and periodic reviews                                                                                         |
| [Kanban Action Planner](https://github.com/dsebastien/obsidian-kanban-action-planner)                         | Render your notes as configurable Kanban boards and calendars inside Bases, with statuses, ordering, relationships, and scheduling            |
| [Life Tracker](https://github.com/dsebastien/obsidian-life-tracker-base-view)                                 | Capture and visualize the data that matters in your life                                                                                      |
| [Note Village](https://github.com/dsebastien/obsidian-note-village)                                           | A 2D pixel art village where your notes become villagers you can explore and chat with using AI                                               |
| [Obsidian Starter Kit](https://github.com/DeveloPassion/obsidian-starter-kit-plugin)                          | Adds strong typing support and powerful automation support for notes                                                                          |
| [Remarkable Synchronizer](https://github.com/dsebastien/obsidian-remarkable-sync)                             | Connect to the reMarkable cloud, list, download, and sync notebook pages as images                                                            |
| [Replicate](https://github.com/dsebastien/obsidian-replicate)                                                 | Use AI models with ease via the Replicate.com integration                                                                                     |
| [REST and MCP server](https://github.com/dsebastien/obsidian-cli-rest)                                        | Exposes CLI commands as RESTful API endpoints and an MCP server for AI tool integration                                                       |
| [Transcriber](https://github.com/dsebastien/obsidian-transcriber)                                             | Transcribe images to markdown using Ollama vision models                                                                                      |
| [Typefully](https://github.com/dsebastien/obsidian-typefully)                                                 | Publish social media posts with ease using the Typefully integration                                                                          |
| [Update Time](https://github.com/dsebastien/obsidian-update-time)                                             | Automatically update front matter to include creation and last update times                                                                   |

Everything I build is documented in [my newsletter](https://dsebastien.net/newsletter) and on [my YouTube channel](https://youtube.com/@dsebastien).

<!-- other-plugins:end -->

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

Found a bug or have an idea? [Open an issue](https://github.com/dsebastien/obsidian-time-machine/issues).
