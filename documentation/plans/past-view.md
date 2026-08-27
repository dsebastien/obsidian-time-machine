# Plan: Past view (in-editor time travel + side-by-side compare)

Implements the in-editor timeline and side-by-side parts of issue #9.
Export-to-markdown and note embedding are out of scope — see #10, #11, #12.

Revised after an adversarial review (26 findings). The headline change: **the reusable pieces
this plan depends on are currently private to `TimeMachineView`**, so extraction comes first,
as Phase 0, before either view is rewired.

## Goal

A read-only "past view" leaf inserted before the leaf holding the live editor. Its header
carries a timeline bar; scrubbing shows that version of the note. A diff switch flips the body
between the rendered old version and the existing unified diff viewer. The right pane stays the
user's real, editable note.

"Past view" and "side-by-side" are the **same view** — side-by-side is this view opened in a
split, full-width is the same view opened as a tab. No second view type.

## Core decisions (locked)

| Decision             | Choice                                                  |
| -------------------- | ------------------------------------------------------- |
| Right column         | The real editor, via native split                       |
| Left body (diff off) | `MarkdownRenderer.render` of the old version, read-only |
| Left body (diff on)  | Existing `DiffViewerComponent`                          |
| Live file            | Never written to for display purposes                   |
| File binding         | Bound to one note by default, with a follow toggle      |
| Sidebar view         | Kept, shares components                                 |
| `diffComparisonMode` | Single shared plugin setting, both views                |
| Timeline             | New responsive `TimelineBar`, shared by both views      |

### Terminology: "bound", not "pinned"

`ViewState` already has a `pinned?: boolean` — Obsidian's own leaf pinning, which stops a leaf
being reused for navigation. That is a **different concept** from "this view shows one fixed
note". Use `boundToFile` in state and "Follow active note" for the UI toggle. Separately, do set
Obsidian's `pinned: true` on the leaf so navigation does not hijack it.

## Rendering security (decided)

`MarkdownRenderer.render` runs every registered markdown post-processor, so rendering a
historical version executes any `dataviewjs` (arbitrary JS) and Dataview queries in it, against
today's index — including blocks the user has since deleted. There is no safe mode on the API,
and sanitising the resulting DOM is useless because execution already happened.

**Decision: neutralise before rendering.** `neutraliseExecutableBlocks()`
(`domain/markdown-safety.ts`) relabels executable fenced blocks to `text` before the markdown
reaches the renderer, so they display as source. `pastViewExecuteBlocks` (default `false`) opts
back into full execution.

Verified in a live vault: a ` ```dataviewjs ` block executed and rendered its output, while the
same block relabelled to ` ```text ` did not run and rendered its source. The view surfaces a
count of neutralised blocks so the behaviour is visible rather than silent.

## Phase 0 — Extraction (no user-visible change)

None of the following is reachable from a second view today. Extract first:

- `selectedSnapshotIndex` and the snapshot session (file, allSnapshots, filtered snapshots,
  selection, fetch/filter/diff logic) are private to `TimeMachineView`
  (`time-machine-view.ts:19-21`). Extract a `SnapshotSession` holding this, owned by each view.
- `ConfirmModal` is a file-private class (`time-machine-view.ts:293`). Move to
  `ui/components/confirm-modal.ts`.
- `DiffViewerComponent` unconditionally renders its own toolbar, comparison toggle, and
  full-restore button (`diff-viewer.ts:23-36`, both private helpers). Extract the comparison
  toggle into a shared control the header can own, and reduce the viewer to body + hunks.
  **Per-hunk restore stays on each hunk** — a header-level "restore hunk" action has nothing to
  address.
- `getActiveViews()` filters to the sidebar `VIEW_TYPE` only (`plugin.ts:142`), and `file-open`
  updates every result (`plugin.ts:30-36`). Split into three capabilities: _poll_, _content
  refresh_, _active-file follow_. The sidebar follows; a past view follows only when unbound.
  The `activeEditor.file`-only cursor rule from Business Rules stays.
- No mechanism propagates `diffComparisonMode` between views — the change handler recomputes
  only its own view (`time-machine-view.ts:191`). Centralise mode changes on the plugin and
  broadcast to every open history view.
- Snapshot fetching runs a sequential `git show` per commit, up to `gitMaxCommits`
  (`snapshot.service.ts:66-70`), and the poll calls `updateForFile` per view independently
  (`plugin.ts:76`). A sidebar + past view on one note doubles it to 100 subprocesses per poll.
  Coalesce in-flight requests and cache per `(path, settings generation)`, then fan out.

Two correctness bugs surface here that also affect the shipped sidebar; fix them in the shared
code rather than duplicating them:

- **Stale async results.** `updateForFile` sets `currentFile`, awaits slow git work, then
  assigns results without rechecking (`time-machine-view.ts:89`); diff reads are equally
  unversioned (`:206`). Rapid switching can render an older request last. Add monotonic request
  generations to snapshot fetch, content reads, diff computation, and markdown rendering, and
  discard stale completions.
- **Hunk restore can apply the wrong hunk.** The callback carries only `hunkIndex`
  (`time-machine-view.ts:188`); on click, content is re-read (`:269`) and the diff recomputed
  before applying that ordinal (`restore.service.ts:20`). Editing beside the view during the 1s
  debounce reorders hunks. Capture the exact content revision the diff was rendered from; if it
  changed, refuse and refresh instead of applying a stale ordinal.

## Phase 1 — `TimelineBar`

Replaces `TimelineSliderComponent` in both views. A **controlled** component: it accepts
`selectedSnapshotId` and renders that selection; it emits changes only for user actions and
never auto-selects. Default/fallback selection belongs to the owning session — the current
component auto-selects index 0 as a render side effect (`timeline-slider.ts:95`) and is
recreated on every render (`time-machine-view.ts:176`), so internal selection cannot survive.

- Ticks positioned **proportionally to timestamp**, not evenly by index. Define zero-span
  behaviour (all snapshots share a timestamp → fall back to even spacing; never divide by zero).
- Ticks closer than a minimum pixel gap merge into a **cluster tick**. Specify: what a cluster
  click selects (its newest member), how a selected snapshot inside a cluster is indicated, and
  that keyboard stepping still visits every snapshot individually.
- Per-tick source icon; mixed-source clusters get a defined representative icon.
- Prev/next buttons, `ArrowLeft`/`ArrowRight` when focused, defined focus retention across
  re-render, and an explicit ARIA model.
- Responsive tiers driven by **`View.onResize()`** (`obsidian.d.ts:6629`) — the native hook —
  not `ResizeObserver`. If an observer is still needed, `TimelineBar` must be a managed
  `Component` that disconnects on unload and re-render, instantiated from the element's own
  window so popout windows work. Pick **one** mechanism as the source of truth for tier
  selection; if container queries are used, `container-type` must actually be set.
- Per the existing business rule, with one snapshot **only the ticks/range/navigation are
  hidden** — the selected-version information and the diff still render, and the sole snapshot
  is still selected.

**Testability:** layout is a pure function — `(snapshots, width) → {ticks, clusters, tier}` —
tested directly. The existing mocks store no child tree, geometry, or handlers
(`time-machine-view.spec.ts:14`, `diff-viewer.spec.ts:16`, `test-setup.ts:16`), so DOM-level
assertions need new fake-geometry infrastructure; keep as little as possible in the DOM layer.

## Phase 2 — `PastView`

View type `time-machine-past-view`. Blocked on the rendering decision above.

**Persisted state**: `{ filePath, boundToFile, snapshotId, snapshotTimestamp, showDiff }`.
The timestamp is persisted **alongside** the id because the "nearest surviving snapshot"
fallback needs it after a restart, when the vanished snapshot is no longer available to read a
timestamp from. Validate both on load; state arrives as `unknown` (`obsidian.d.ts:6608`).
Normalise it, merge defaults without clobbering a valid `false`, and call the debounced
`workspace.requestSaveLayout()` (`obsidian.d.ts:6751`) after every persistent mutation —
`setState` alone does not schedule a save.

**Header**: file name + count · `TimelineBar` · selected-version label (date, source, commit
metadata) · diff switch · shared comparison control · follow toggle · actions menu.

**Body**: rendered old version, or `DiffViewerComponent`.

**Rendering lifecycle**: the fifth argument to `MarkdownRenderer.render` is _the parent that
manages the rendered children_ (`obsidian.d.ts:3939`) — emptying the container does not unload
it. Create one child `Component` and one fresh container per render, `addChild` it to the view,
and `removeChild` the previous one (`obsidian.d.ts:1811`) before replacing. Guard async
completion with a render generation.

**Rendering semantics**: this is _historical source rendered against the current vault_ —
embeds, links, Dataview results and metadata all resolve to today's vault, not to how they
looked then. Say so in the UI copy rather than implying a faithful time capsule. Apply
`markdown-preview-view markdown-rendered` classes; there is currently no CSS for a rendered
body.

**Empty state**: with no snapshots, the timeline, switches and actions are not rendered at all.

## Phase 3 — Opening

`openPastView(app, file)`:

1. Narrow to a markdown `TFile`. `file-menu` hands over a `TAbstractFile` (`obsidian.d.ts:7058`)
   and editor context exposes `file: TFile | null` (`obsidian.d.ts:3757`).
2. Search **root** leaves for a `MarkdownView` showing exactly that file. If none, open the file
   in a root editor leaf first. Never split the active leaf blindly — it may be a sidebar,
   another past view, or an unrelated note.
3. `createLeafBySplit(targetLeaf, 'vertical', true)`. The signature
   (`obsidian.d.ts:6794`) documents neither geometry nor sizing: `before: true` **inserts before
   the target**, which is visually left in standard LTR layouts. Not guaranteed under RTL or
   stacked tabs, and restored layouts keep their saved dimensions rather than 50/50. Document
   these as limitations; verify manually.
4. Reuse an existing past view for the same file rather than opening a second. Detect via
   `leaf.getViewState()`, not `leaf.view` — deferred leaves expose a `DeferredView`
   (`obsidian.d.ts:7222`).
5. Mobile / narrow workspace: open as a tab instead of splitting.

Entry points: command · sidebar header button (carrying file **and** selection) · `file-menu`
and `editor-menu` · ribbon icon. Command name must **not** contain "Time Machine" — Obsidian
prefixes commands with the plugin name and AGENTS.md:254 forbids it. Use id
`open-past-view`, name **"Open past view for current note"**.

Workspace restore is only claimed for _restart with the plugin still enabled_. Register the view
before layout restoration. Unknown-view-type handling is internal Obsidian behaviour, not API.
A restored view whose file was deleted or renamed shows an empty state, not a crash.

## Phase 4 — Actions

Restore entire version (shared confirm modal) · per-hunk restore (diff ON + `current` mode only,
with the revision guard from Phase 0) · copy old version · open old version as a new note.

Open-as-note writes `<basename> (yyyy-MM-dd HH-mm).md` beside the original with no prompt.
`vault.create` rejects when the path exists (`obsidian.d.ts:6344`), so catch and retry with a
numeric suffix rather than pre-checking — pre-checking races. Normalise root-folder paths.
Surface clipboard, permission and open failures through `Notice`. This is the plugin's first
creation of a new file; call it out in the README.

## Phase 5 — Live sync

- **Content changes**: on `vault.modify` of the bound file (debounced 1s), always re-read and
  re-filter. The plan previously skipped this in `next` mode — that was **wrong**: the newest
  snapshot's "next" target _is_ the live file (Business Rules, `time-machine-view.ts:219`), and
  current content also drives snapshot filtering. Recompute in `current` always, in `next` when
  index 0 is selected, and whenever filtering changes the selection or its neighbour.
- **Snapshot refresh**: via the coalesced fetch from Phase 0. Selection preserved by id, falling
  back to nearest surviving timestamp. Define tie-breaking and what happens when dedup replaces
  the selected snapshot with an identical-content newer one.

## Phase 6 — Settings and docs

Settings ship **with the feature that consumes them**, not batched at the end:
`pastViewEnabled`, `pastViewDefaultShowDiff`, `pastViewExecuteBlocks`, `timelineBarRichMode`.
Note that `timelineBarRichMode` as a fallback requires _keeping_ the old slider, which
contradicts "supersedes" — either drop the fallback or keep both components deliberately.

Docs: `Configuration.md` (canonical settings list — every setting and default), `Architecture.md`,
`Domain Model.md` (`PastViewState`, `SnapshotSession`), `Business Rules.md`, `docs/usage.md`,
`README.md`, `documentation/history/<today>.md`. Close or delete this plan when done.

## Sequencing

Vertical slices — each lands with its setting, types, UI, docs and tests together:

0. Extraction + the two shared correctness fixes. No user-visible change; existing tests stay green.
1. `TimelineBar` (controlled, pure layout core) wired into the sidebar.
2. Rendering decision → `PastView` skeleton.
3. Diff switch.
4. Opening + entry points.
5. Actions.
6. Live sync.
7. Settings/docs consolidation and plan closure.

The previous ordering claimed each step landed green while step 1 depended on a setting not
introduced until step 7, and separated docs from behaviour despite AGENTS.md:30 requiring docs
with each change. That is fixed here.

## Deferred

**Scroll sync is not in this plan.** The public API is
`scrollIntoView(range: EditorRange, center?: boolean)` (`obsidian.d.ts:2349`) — it needs
`{from,to}` positions, not a line. There is no public editor-scroll event, no way to resolve the
adjacent editor once focus moves left, no historical→current line mapping, and rendered blocks
carry no source-line metadata. Filed separately; needs a prototype before any setting is
documented.

## Verification

`bun run tsc`, `bun run lint`, `bun test`, `bun run build`.

New tests: state normalisation and restoration, teardown/unload, stale async discarding,
bound/follow routing, mode broadcast across views, split targeting, filename collision,
executable-block gating, and pure timeline layout (positioning, clustering, zero-span,
keyboard stepping).

**Manual (GUI — not self-verifiable):** split lands left and drags · scrubbing updates the body ·
diff switch flips it · both restore paths · editing the right pane updates the left after ~1s ·
follow toggle · both views agree on comparison mode · mobile opens a tab · zero-snapshot note
shows only the empty state · restart restores file and snapshot · popout window · RTL/stacked
layouts · a historical `dataviewjs` block does **not** execute with the default setting.
