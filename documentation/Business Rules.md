# Business Rules

This document defines the core business rules. These rules MUST be respected in all implementations unless explicitly approved otherwise.

---

## Documentation Guidelines

When a new business rule is mentioned:

1. Add it to this document immediately
2. Use a concise format (single line or brief paragraph)
3. Maintain precision - do not lose important details for brevity
4. Include rationale where it adds clarity

---

## File Recovery Dependency

The plugin requires the File Recovery core plugin to be enabled. If not available, a Notice is shown and the view displays an appropriate empty state.

## Restore Safety

Full version restore requires user confirmation via a modal dialog. Hunk restores apply immediately without confirmation.

## View Behavior

The Time Machine view opens in the right sidebar. It auto-updates when switching files via the `file-open` event. Users open it manually via the "Open view" command.

## Snapshot Ordering

Backups are always sorted descending by timestamp (newest first).

## Compare Modes

- **Current vs version**: compares the live file content against a selected backup
- **Version vs version**: compares two selected backups (older vs newer based on timestamps)
