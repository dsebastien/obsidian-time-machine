# Plan: Past view (in-editor time travel + side-by-side compare)

Implements the in-editor timeline and side-by-side parts of issue #9.
Export-to-markdown and note embedding are **out of scope** here — filed as separate issues.

## Goal

A read-only "past view" leaf that opens in a native vertical split to the **left** of the
live editor. Its header carries a rich Apple-Time-Machine-style timeline bar; scrubbing it
shows that version of the note. A diff switch in the same header flips the body between the
rendered old version and the existing unified diff viewer. The right pane stays the user's
real, editable note — Obsidian's own splitter provides the adjustable 50/50.

"Past view" and "side-by-side" are the **same view**. Side-by-side is just this view opened
in a split; full-width is the same view opened as a tab. No second view type.

## Core decisions (locked)

| Decision             | Choice                                                                | Why                                                                                                 |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Right column         | The real editor, via native split                                     | A live `MarkdownView` cannot be embedded in a custom view. Split gives editability + free splitter. |
| Left body (diff off) | `MarkdownRenderer.render` of the old version, read-only               | Looks like the note did then.                                                                       |
| Left body (diff on)  | Existing `DiffViewerComponent` replaces the render                    | Zero new diff logic; per-hunk restore keeps working.                                                |
| Live file            | Never written to for display purposes                                 | Swapping editor content would dirty the file, fire `modify`, and pollute file-recovery.             |
| File binding         | Pinned to the note it was opened for, with a pin/follow toggle        | Avoids the issue #7 wrong-file resolution class entirely.                                           |
| Sidebar view         | Kept, shares components                                               | No breaking change for 1.4.0 users' saved layouts.                                                  |
| `diffComparisonMode` | Single shared plugin setting, both views                              | One source of truth, already persisted.                                                             |
| Timeline             | New rich `TimelineBar`, responsive, replaces the slider in BOTH views | One component to maintain and test.                                                                 |

## Work breakdown

### 1. `TimelineBar` component (shared)

Replaces `TimelineSliderComponent`. Same `onSelect(snapshot, index)` contract so the sidebar
view swaps over with no logic change.

- Ticks: one per snapshot, positioned **proportionally to timestamp**, not evenly by index —
  otherwise a burst of 20 file-recovery saves in one minute looks like a month of history.
- Per-tick source icon (`clock` / `git-branch`), tooltip with full date + commit metadata.
- Selected tick emphasised; left = newest, right = oldest (preserves existing orientation).
- Prev/next buttons and `ArrowLeft` / `ArrowRight` keyboard stepping when focused.
- Responsive via `ResizeObserver` + container queries: below a width threshold, labels drop,
  then ticks collapse to a plain range input. The sidebar lands in the collapsed tier by default.
- Ticks closer than a minimum pixel gap **merge into a cluster tick**; stepping still visits
  every snapshot. Prevents an unusable smear of overlapping ticks on dense histories.
- Hidden entirely when `snapshots.length <= 1`, matching the existing business rule.

Tests: proportional positioning, clustering threshold, keyboard stepping across clustered
ticks, responsive tier selection, single-snapshot hiding, selection-by-id preservation.

### 2. `PastView` (new `ItemView`)

New view type `time-machine-past-view`.

**State** (`getState`/`setState`, so it survives restart and workspace restore):
`{ filePath: string, pinned: boolean, snapshotId: string | null, showDiff: boolean }`.
Selection persists by **snapshot id, not index** — indices shift as snapshots are added,
dropped by dedup, or filtered against current content.

**Header** (left column header, always visible):

- File name + snapshot count.
- `TimelineBar`.
- Selected-version label (date, source, commit hash/message/author for git).
- `Show diff` switch.
- `Compare with: Current file / Next version` toggle — the existing shared segmented control.
- Pin/follow toggle.
- Action menu: Restore entire version · Restore hunk (contextual) · Copy old version ·
  Open old version as a new note.

**Body**: rendered old version, or `DiffViewerComponent`, per the diff switch.

**Empty states**: reuse `renderEmptyState`. Per issue #9, when a note has no snapshots the
timeline, diff switch, and action menu are **not rendered at all** — only the empty state.

### 3. Opening

`openPastView(app, file, opts)` helper, used by every entry point:

- Locate the leaf currently showing `file` (or the active leaf).
- `workspace.createLeafBySplit(targetLeaf, 'vertical', true)` → new leaf to the **left**.
- `leaf.setViewState({ type: 'time-machine-past-view', state: { filePath, pinned: true, ... } })`.
- If a past view for that file already exists, reveal and refocus it instead of opening a second.
- Mobile / narrow workspace: no split — open as a tab (`getLeaf('tab')`). This is the
  "in-editor past view" experience on mobile and it needs no extra code.

Entry points (all four):

- Command: `Open Time Machine for current note`.
- Button in the sidebar view header — promotes, carrying current file **and** selected snapshot.
- File menu (`file-menu` and `editor-menu`): `Open in Time Machine`.
- Ribbon icon (`clock`).

### 4. Actions

- **Restore entire version** — existing `RestoreService.restoreFullVersion` + confirm modal.
- **Per-hunk restore** — only when diff is ON **and** mode is `current`. Hidden otherwise;
  the handler refuses as a second guard, per the existing Restore Safety business rule.
- **Copy old version** — `navigator.clipboard.writeText` + `Notice`.
- **Open old version as a new note** — writes `<basename> (yyyy-MM-dd HH-mm).md` beside the
  original, no prompt. Collisions get a numeric suffix. Uses `vault.create`, then opens it in
  a new tab. Note: this is the plugin's first write of a _new_ file — call it out in the README.

### 5. Live sync

- **Diff refresh**: on `vault.modify` of the pinned file, debounced 1s, re-diff against the new
  content. Only when comparison mode is `current` (in `next` mode the live file is irrelevant).
- **Snapshot refresh**: hook the existing file-recovery interval re-fetch. Timeline re-renders;
  selection preserved by snapshot id; if the selected snapshot vanished (dedup/filtering),
  fall back to the nearest surviving one by timestamp.
- **Scroll sync**: ship **behind a setting, default off**, and last. Rendered-markdown block
  offsets do not map cleanly to editor lines. Approach: map the top visible rendered block to
  its source line via the diff's line accounting, then `editor.scrollIntoView`. If it proves
  janky in manual testing, ship the feature without it and file a follow-up rather than
  shipping a bad sync.

### 6. Settings

New section "Past view":

- `pastViewEnabled` (default true) — hides the command, ribbon, and menu items when off.
- `pastViewDefaultShowDiff` (default false).
- `pastViewScrollSync` (default false).
- `timelineBarRichMode` (default true) — escape hatch back to the plain slider.

### 7. Documentation

- `documentation/Architecture.md`: new UI section for `PastView` + `TimelineBar`; note that
  `TimelineSliderComponent` is superseded.
- `documentation/Domain Model.md`: `PastViewState`.
- `documentation/Business Rules.md`: new rules — Past View Placement, Past View Pinning,
  Read-only Guarantee, Selection Identity (id not index), plus the mobile fallback.
- `documentation/history/<today>.md`.
- `docs/usage.md` + `README.md`: the new view, entry points, settings.

## Sequencing

Each step lands green (`tsc`, `lint`, `test`, `build`) on its own.

1. `TimelineBar` + tests, behind `timelineBarRichMode`, wired into the **sidebar** view first.
   Proves the component in the existing surface before any new view exists.
2. `PastView` skeleton: view registration, state, header, rendered old version, timeline.
   No diff, no actions.
3. Diff switch → `DiffViewerComponent` reuse.
4. Entry points + `openPastView` helper + existing-leaf reuse + mobile tab fallback.
5. Actions (restore full, hunk, copy, open-as-note).
6. Live sync (diff refresh, snapshot refresh).
7. Settings + documentation.
8. Scroll sync, behind its setting. Cut it if it feels bad.

## Risks

- **`MarkdownRenderer.render` lifecycle** — must be passed a `Component` that is properly
  unloaded, or embeds/dataview/mermaid inside old versions leak. Register the render child on
  the view and clear on every re-render.
- **Rendering old versions has side effects** — a historical version may contain Dataview or
  Templater blocks that execute on render. Consider a setting to render as plain source, and
  verify what a `dataviewjs` block does when rendered from a past version.
- **`sourcePath` for rendering** — passing the real path makes relative links and embeds
  resolve correctly, but also makes the rendered old version look "live". Correct call is to
  pass the real path and rely on the read-only container.
- **Split direction on RTL / stacked-tab layouts** — `before: true` may not land visually left.
  Verify manually.
- **Two past views for two notes** — supported; each is pinned, no shared state beyond settings.
- **Workspace restore** — the view restores from `setState` for a file that may have been
  deleted or renamed. Handle missing file with an empty state, not a crash.

## Verification

Automated: `bun run tsc`, `bun run lint`, `bun test`, `bun run build`.

**Manual (agents cannot self-verify this — GUI):**

- Split really opens to the left of the note, splitter drags.
- Scrubbing updates the left pane; diff switch flips body; both restore paths work.
- Editing the right pane updates the left diff after ~1s.
- Pin toggle: pinned view ignores file switches; unpinned follows.
- Sidebar + past view open simultaneously stay consistent on `diffComparisonMode` changes.
- Mobile: opens as a tab, timeline collapses, no split.
- Note with zero snapshots shows only the empty state — no timeline, no switches.
- Restart with the view open: correct file and snapshot restored.
