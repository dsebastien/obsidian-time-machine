# Durable history (#10, #12)

## Approved scope

Two current-Markdown-note commands share one deterministic Markdown renderer.
No vault-wide export, configurable folders, new settings, dependencies or Git writes.
Options dialog: diffs (default) / full versions; newest N or all available.
Export defaults to all fetched snapshots; freeze defaults to 20. Existing Git limits apply.
Export creates a collision-safe sibling. Freeze requires confirmation and replaces only its
own marked section, preserving the remaining note and rejecting concurrent source changes.

## Implementation

1. Pure domain helpers in `src/app/domain/`: strict marked-section extraction/replacement,
   recursion prevention, deterministic ordering/dedup, safe fenced Markdown, metadata and
   chronological diffs. Adjacent `.spec.ts` tests first.
2. Services in `src/app/services/`: reuse collision-safe creation, fetch through the shared
   snapshot cache, freeze via `vault.process` with a source-content/path guard.
3. Native options modal in `src/app/ui/components/` and two stable commands in
   `src/app/commands/`. Capture the target before async work; show progress and errors;
   cancel on dismissal/unload. Confirmation states note, version count and output size.
4. Update `docs/usage.md`, user-facing feature summary, technical docs and today's history.

## Output and safety

- Newest-first entries, UTC ISO timestamps, Git author/hash/message, File Recovery author
  explicitly unavailable. No export-time clock in the document.
- Diffs run from each older version to the entry's version; oldest included entry is a
  baseline from empty. Full versions are inert source, not executable rendered Markdown.
- Re-fetching cannot export a previous generated section. Strict standalone comment markers;
  marker examples inside fences are not managed sections.
- Keep snapshots matching current content: timeline filtering is not an archive rule.
- Reject oversized output rather than silently truncate; report available/exported counts
  and the configured Git limit. This is recorded local history, not cryptographic proof.

## Style and boundaries

Follow existing strict TypeScript and native Obsidian components; no unsafe casts or rule
disables. Pure functions return typed results, for example
`stripFrozenHistory(content: string): string`. Never touch generated artifacts manually,
change existing settings semantics, modify Git, or overwrite an existing export.

## Verification

`bun run tsc:watch` during edits. Targeted `bun test --isolate` per slice; then
`bun run format`, `bun run tsc`, `bun run lint`, `bun test --isolate`,
`bun run rules:check`, `bun run build`.
Tests cover output determinism, metadata, fences/markers, empty/duplicate history, limits,
collisions, cancellation, write rejection, concurrent edits and repeated freeze.
Manual Obsidian acceptance: both dialogs, keyboard/cancel, exported reading view, confirmation,
repeat freeze and note preservation, including mobile/popout layouts.

## Progress

- [x] Domain renderer and marked sections
- [x] Export/freeze services
- [x] Dialog and commands
- [x] Documentation, final formatting, full validation (347 tests) and production build
- [ ] Manual Obsidian acceptance (requires a live vault)
