# Configuration

## Plugin Settings

| Setting                   | Type    | Default   | Description                                                                      |
| ------------------------- | ------- | --------- | -------------------------------------------------------------------------------- |
| `gitIntegrationEnabled`   | boolean | `true`    | Show git commits as snapshots on the timeline (desktop only)                     |
| `gitMaxCommits`           | number  | `50`      | Maximum number of git commits to fetch per file (1-200)                          |
| `diffComparisonMode`      | string  | `current` | Which newer version the selection is diffed against: `current` or `next`         |
| `pastViewEnabled`         | boolean | `true`    | Past view available, along with its command, ribbon icon and menu items          |
| `pastViewDefaultShowDiff` | boolean | `false`   | Past view opens showing the diff rather than the rendered old version            |
| `pastViewExecuteBlocks`   | boolean | `false`   | Allow executable blocks in a rendered old version to run (see the warning below) |

`diffComparisonMode` has no settings-tab control — it is persisted from the in-panel toggle, and shared by every open history view.

### `pastViewExecuteBlocks`

Off by default, and worth leaving off.

Rendering a historical version runs every registered markdown post-processor, so any `dataviewjs` block in that version executes arbitrary JavaScript, and Dataview queries run against the vault **as it is today** — including blocks that have since been deleted from the note. While this setting is off, those blocks are relabelled before rendering and shown as plain source instead, and the view reports how many it defused.

## Unknown keys

Settings are loaded by picking known keys only. A key that is not part of `PluginSettings` is ignored rather than merged in and written back out on the next save.

## Settings UI

The settings tab includes:

1. **Past view** section
    - Toggle: Enable past view
    - Toggle: Open showing changes
    - Toggle: Run code in old versions
2. **Git integration** section
    - Toggle: Enable git integration
    - Slider: Maximum git commits (1-200)
    - Live git availability status (mobile / git not detected / repository detected)
3. **Follow me on X** button
4. **Support** section with Buy Me a Coffee link

## Commands

| ID               | Name                                          | Notes                                                         |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `open-view`      | Open view                                     | Sidebar history view                                          |
| `open-past-view` | Open past view for current note               | Hidden when `pastViewEnabled` is off or the note is not `.md` |
| `force-snapshot` | Force file recovery snapshot for current file | Hidden when no file is active                                 |

Command names must not contain the plugin name — Obsidian already prefixes them with it in the palette.

## Other entry points for the past view

- Ribbon icon (clock/history)
- File menu (`file-menu`) on markdown notes
- Editor context menu (`editor-menu`)
- "Open past view" button in the sidebar view header
