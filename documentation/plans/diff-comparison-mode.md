# Plan: version-to-version diff comparison mode

## Origin

Follow-up on issue #6 ([comment](https://github.com/dsebastien/obsidian-time-machine/issues/6#issuecomment-4903021269)),
reported by hmijail against v1.0.6.

The diff rendering (original #6) is fixed. This is a separate request about **which two
versions get compared**.

## Problem

Today the diff always compares the **selected snapshot against the current file content**
(`TimeMachineView.computeAndRenderDiff`, `snapshot.data → currentContent`). Selecting an
old version therefore shows the **cumulative** drift from that point to now.

The user wants **version-to-version** ("from the selected one to the next one") — the
**incremental** change at each step — which is what Obsidian's core File Recovery shows.
They asked for it as an **option**, keeping the current behavior available.

## Model

Snapshots are sorted newest-first: `snapshots[0]` = newest, `snapshots[n-1]` = oldest.
Full timeline in chronological order:

```
oldest … snapshots[2]  snapshots[1]  snapshots[0]  Current(C)
```

"The next one" after selected index `i` is the chronologically newer version:

```
newerContent = (i === 0) ? currentContent : snapshots[i - 1].data
diff( snapshots[i].data  →  newerContent )
```

Properties this gives us:

- **No missing-"next" edge case** — every snapshot has a next, because `C` sits above all.
- **Consistent at the top** — for the newest snapshot both modes are `snapshots[0] → C`;
  the modes only diverge once you scrub into the past.
- Must use the **filtered `snapshots`** array (not `allSnapshots`) so indices stay aligned
  with the timeline slider, which indexes into `snapshots`.

## Decisions

- **Two modes, default = current behavior.** Mode `current` (selected → current file) stays
  the default so existing users are unaffected; mode `next` (selected → next newer version)
  is opt-in.
- **In-panel toggle**, not settings-only — the mode is flipped while scrubbing the timeline.
  Lives in the diff-viewer toolbar next to "Restore entire version". Last choice persisted
  to settings so it is remembered across sessions.
- **Per-hunk restore is hidden in `next` mode.** In `next` mode the displayed hunks are
  between two historical versions (`S → next`); their line numbers/content are relative to
  `next`, not the current file, so applying one to `C` is undefined/unsafe. "Restore entire
  version" stays (it writes the selected snapshot fully — coherent in both modes).

## Work items

### Settings

- `plugin-settings.intf.ts`: add `diffComparisonMode: 'current' | 'next'`, default `'current'`.
  Update `DEFAULT_SETTINGS`.
- No settings-tab UI required (the toggle is in-panel), but the value is persisted via the
  existing `saveSettings()`.

### View — `time-machine-view.ts`

- `computeAndRenderDiff`: branch on `plugin.settings.diffComparisonMode`.
    - `current`: unchanged (`snapshot.data → currentContent`, label `Current`).
    - `next`: compute `newerContent`/`newerLabel` per the model above and diff `snapshot.data →
newerContent`. Label = `Current` for `i === 0`, else `formatDiffLabel(snapshots[i-1])`.
- Pass the active mode (and a mode-change handler that persists + recomputes) into the
  diff-viewer.

### Diff viewer — `components/diff-viewer.ts`

- Add a toolbar control: **Compare against: [ Current file ] [ Next version ]** (segmented
  toggle / two buttons) with a short tooltip explaining each.
- New callbacks: `onComparisonModeChange(mode)`.
- Hide the per-hunk restore button when the active mode is `next`.

### Restore

- No change to `RestoreService`. Hunk restore is simply not offered in `next` mode.
- "Restore entire version" path is unchanged.

## Tests

- `time-machine-view.spec.ts`:
    - `next` mode diffs `snapshots[i]` against `snapshots[i-1]`.
    - `next` mode on newest snapshot (`i === 0`) diffs against current content (== `current` mode).
    - mode change persists to settings and triggers a recompute.
- `diff-viewer` spec (or view spec): per-hunk restore button hidden in `next` mode, shown in
  `current` mode.

## Docs

- `README.md` / `docs/`: document the comparison-mode toggle and what each mode shows.
- `documentation/history/<today>.md`: record the change and decisions.
- `documentation/Business Rules.md`: add a rule if the "hunk restore unavailable in
  version-to-version mode" constraint should be an invariant.

## Out of scope / flagged

- Alternative anchor `previous → selected` ("the change this version introduced") — differs
  from the chosen `selected → next` only by an off-by-one while scrubbing. Going with the
  user's literal "to the next one" reading, which also yields the clean "newest == current
  file" property.
