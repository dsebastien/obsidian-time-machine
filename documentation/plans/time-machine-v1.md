# Time Machine v1 - Implementation Plan

## Status: COMPLETE (implemented + tested in vault)

## Summary

Time Machine plugin that leverages Obsidian's file-recovery core plugin to browse, compare, and restore previous versions of notes.

## Architecture

```
src/
  main.ts                                  # Re-exports TimeMachinePlugin
  styles.src.css                           # Tailwind + Obsidian CSS vars
  app/
    plugin.ts                              # TimeMachinePlugin lifecycle
    constants.ts                           # VIEW_TYPE, PLUGIN_NAME
    types/
      plugin-settings.intf.ts              # PluginSettings (empty, enabled setting removed)
      obsidian-internals.d.ts              # Module augmentation for internalPlugins
      backup.intf.ts                       # FileRecoveryBackup interface
      diff.intf.ts                         # CompareMode, DiffHunk, DiffResult
    settings/
      settings-tab.ts                      # TimeMachineSettingTab
    commands/
      register-commands.ts                 # open-time-machine command
    services/
      file-recovery.service.ts             # IndexedDB access for file-recovery backups
      diff.service.ts                      # Wraps jsdiff structuredPatch
      restore.service.ts                   # Full version + selective hunk restore
    domain/
      backup.ts                            # Sort, format dates, relative time
    ui/
      time-machine-view.ts                 # TimeMachineView (ItemView sidebar)
      components/
        version-list.ts                    # Scrollable version timeline
        diff-viewer.ts                     # Diff hunks with restore buttons
        compare-mode-selector.ts           # Current-vs-version / version-vs-version
        empty-state.ts                     # Empty state messages
```

## Future Enhancements

- Search/filter snapshots by date range
- Export diff as patch file
- Keyboard navigation in version list
- Side-by-side diff view
- Snapshot annotations/labels
