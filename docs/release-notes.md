# Release Notes

## 2.0.0 (2026-08-28)

### ⚠ BREAKING CHANGES

- **plugin:** requires Obsidian 1.13.0 (minAppVersion bumped from 1.8.7).

`getSettingDefinitions()` replaces `display()` — it is all-or-nothing, so the
whole pane is now declarative. Obsidian owns navigation, focus and ARIA, and
every name/desc is indexed by the settings search.

The write path changed with it. The tab used to mutate `plugin.settings` and
then call `saveSettings()`, so a failed write left memory ahead of disk and the
control showing a value that was never stored. All edits now go through a
serialized, persist-then-commit `updateSettings`: memory is swapped only after
saveData() resolves, and writes queue so each mutation derives from the
previous committed state.

That matters more here than elsewhere because this plugin has two writers.
`setComparisonMode` — driven by the in-panel toggle, one click away from a pane
edit — also routes through `updateSettings` now; before, the two could interleave
and the second commit would drop the first edit.

Preserved from the old tab: the ribbon sync on "Enable past view", and the view
refresh on "Run code in old versions" (which must unload code already running in
an open past view, not just affect the next render). Both now run only after the
write lands. The async Git-availability probe re-checks that its row is still
connected before writing, since the pane can close while it runs.

Also ports the template's settings guard spec, which fails the two render-hook
patterns that no test can otherwise catch, and documents the traps in AGENTS.md.

### Features

- **plugin:** declare settings via getSettingDefinitions (Obsidian 1.13)

### Bug Fixes

- **build:** align with the catalog reviewer's archive, ruleset and audit
- **plugin:** restore the follow button and stack the support block
- **ui:** move the settings-stack rule out of the components layer

## 1.5.2 (2026-08-28)

### Bug Fixes

- **plugin:** remove the remaining unsafe-any warnings from the review

## 1.5.1 (2026-08-28)

### Bug Fixes

- **plugin:** satisfy the Obsidian plugin review checks

## 1.5.0 (2026-08-27)

### Features

- **plugin:** add the past view (issue [#9](https://github.com/dsebastien/obsidian-time-machine/issues/9))
- **plugin:** neutralise executable blocks before rendering old versions
- **plugin:** refine the version rail
- **plugin:** replace the timeline with a version rail

### Bug Fixes

- **plugin:** address the adversarial review of the past view
- **plugin:** close three neutralisation bypasses and split the async guards
- **plugin:** discard stale async results and guard hunk restore
- **plugin:** follow the active note and stop pinning the tab
- **plugin:** keep every version reachable in a large history
- **plugin:** separate the comparison mode options
- **plugin:** truncate long filenames instead of overflowing the header

## 1.4.0 (2026-08-19)

### Features

- **plugin:** add a version-to-version diff comparison mode
- **plugin:** show what's new in a tab instead of a modal dialog
- **plugin:** surface support CTAs everywhere users can see them

### Bug Fixes

- **plugin:** stop cursor-following from resolving files via getActiveFile

## 1.3.0 (2026-07-29)

### Features

- **plugin:** aggregate what's new dialogs across simultaneously updated plugins

## 1.2.0 (2026-07-29)

### Features

- **plugin:** add Knowii community to the what's new dialog and harden it

## 1.1.0 (2026-07-27)

### Features

- **plugin:** show a what's new dialog once after plugin updates

## 1.0.8 (2026-07-17)

## 1.0.7 (2026-07-13)

### Bug Fixes

- **plugin:** keep view fixed while interacting with the slider

## 1.0.6 (2026-06-17)

### Bug Fixes

- **plugin:** follow text cursor so continuous-scroll views track the right file

## 1.0.5 (2026-06-09)

## 1.0.4 (2026-06-09)

### Bug Fixes

- **all:** fixed issue with diffs and improved rendering

## 1.0.3 (2026-05-18)

### Bug Fixes

- **all:** work around conflict with Pane-Relief plugin

## 1.0.2 (2026-05-15)

## 1.0.1 (2026-05-14)

## 1.0.0 (2026-05-13)

## 0.6.0 (2026-04-22)

### Features

- **all:** warn if git is not available or if not in a git repository but the git integration is enabled

## 0.5.2 (2026-03-01)

### Bug Fixes

- **all:** fixed error with uninitialized iew

## 0.5.1 (2026-02-21)

### Bug Fixes

- **all:** fixed bug

## 0.5.0 (2026-02-13)

### Features

- **all:** made the diffs selectable

## 0.4.0 (2026-02-12)

### Features

- **all:** added command to force the creation of a snapshot using file recovery

## 0.3.0 (2026-02-12)

### Features

- **all:** added git support (desktop only)

## 0.2.0 (2026-02-11)

### Features

- **all:** added more spacing between the slider and dates
- **all:** improved styling of the slider

## 0.1.0 (2026-02-11)

### Features

- **all:** added docs template
- **all:** added Obsidian mock for tests
- **all:** added watch mechanism to update snapshots and diffs. Adapted manifests
- **all:** added watch/refresh mechanism to handle active note modifications vs diffs
- **all:** condense the view a bit more
- **all:** improved compliancy with obsidian release checks
- **all:** improved UI. Added slider
- **all:** improved visuals
- **all:** initial version
- **all:** snapshots with no differences for the current file are now filtered out
- **all:** updated scripts
- **all:** updated scripts

### Bug Fixes

- **all:** adapt the build.ts to be generic
- **all:** fied the release workflow to name the tags correctly
- **all:** fix image url
- **all:** use console.debug instead of console.log
