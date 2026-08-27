import { MarkdownView, Notice, Platform, type TFile, type WorkspaceLeaf } from 'obsidian'
import { PAST_VIEW_TYPE } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import { normalisePastViewState } from '../domain/past-view-state'
import { log } from '../../utils/log'

/** Below this workspace width, splitting leaves both panes unusably narrow. */
const MIN_WIDTH_TO_SPLIT = 700

/**
 * Opens the past view for a file.
 *
 * The view is inserted *before* the leaf showing that file, which is visually
 * to its left in standard LTR layouts, so the user reads old-on-the-left and
 * keeps their real, editable note on the right with Obsidian's own splitter.
 * `createLeafBySplit` documents neither geometry nor sizing, so this is
 * behaviour rather than contract — under RTL or stacked tabs the placement may
 * differ.
 */
export interface PastViewSelection {
    snapshotId: string | null
    /** Persisted with the id so the nearest-survivor fallback still works. */
    snapshotTimestamp: number | null
}

/**
 * Opens in flight, keyed by path.
 *
 * `setViewState` is async, so two quick launches could both pass the
 * already-open check before either created its leaf, producing duplicates.
 */
const inFlight = new Map<string, Promise<void>>()

export async function openPastView(
    plugin: TimeMachinePlugin,
    file: TFile,
    selection: PastViewSelection = { snapshotId: null, snapshotTimestamp: null }
): Promise<void> {
    if (file.extension !== 'md') {
        new Notice('Time Machine: Only markdown notes have a history view')
        return
    }

    const pending = inFlight.get(file.path)
    if (pending) {
        await pending
        return
    }

    const run = doOpenPastView(plugin, file, selection).finally(() => {
        inFlight.delete(file.path)
    })
    inFlight.set(file.path, run)
    await run
}

async function doOpenPastView(
    plugin: TimeMachinePlugin,
    file: TFile,
    selection: PastViewSelection
): Promise<void> {
    const { app } = plugin

    const existing = findExistingPastView(plugin, file.path)
    if (existing) {
        // Apply the incoming selection before revealing, so promoting from the
        // sidebar lands on the version the user was already looking at.
        if (selection.snapshotId !== null) {
            const state = normalisePastViewState(existing.getViewState().state)
            await existing.setViewState({
                type: PAST_VIEW_TYPE,
                active: true,
                state: { ...state, ...selection }
            })
        }
        await app.workspace.revealLeaf(existing)
        return
    }

    let targetLeaf = findEditorLeafForFile(plugin, file)

    // Launched from the file explorer, where the note may not be open at all.
    // Open it in a root editor first, so the split still yields the promised
    // old-version-left / live-note-right arrangement.
    if (!targetLeaf && canSplit(plugin)) {
        const editorLeaf = app.workspace.getLeaf('tab')
        await editorLeaf.openFile(file)
        targetLeaf = editorLeaf
    }

    let leaf: WorkspaceLeaf
    if (targetLeaf && canSplit(plugin)) {
        leaf = app.workspace.createLeafBySplit(targetLeaf, 'vertical', true)
    } else {
        // Mobile or a narrow workspace: a tab is the full-width past view and
        // needs no extra handling.
        leaf = app.workspace.getLeaf('tab')
    }

    await leaf.setViewState({
        type: PAST_VIEW_TYPE,
        active: true,
        state: {
            filePath: file.path,
            // Follows the active note by default, like the sidebar panel.
            boundToFile: false,
            snapshotId: selection.snapshotId,
            snapshotTimestamp: selection.snapshotTimestamp,
            showDiff: plugin.settings.pastViewDefaultShowDiff
        }
    })

    // The leaf is deliberately NOT pinned. `PastView.navigation = false`
    // already stops Obsidian recycling it to open a file, and pinning showed a
    // pin marker on the tab that invited the user to remove that protection.
    await app.workspace.revealLeaf(leaf)
}

function canSplit(plugin: TimeMachinePlugin): boolean {
    if (Platform.isMobile) return false
    const width = plugin.app.workspace.containerEl.clientWidth
    // A zero width means the layout has not been measured; prefer splitting.
    return width === 0 || width >= MIN_WIDTH_TO_SPLIT
}

/**
 * An already-open past view for this file, if any.
 *
 * Inspects `leaf.getViewState()` rather than `leaf.view`: a deferred leaf
 * exposes a `DeferredView` placeholder until it is activated, so checking the
 * concrete class would miss it and open a duplicate.
 */
function findExistingPastView(plugin: TimeMachinePlugin, path: string): WorkspaceLeaf | null {
    for (const leaf of plugin.app.workspace.getLeavesOfType(PAST_VIEW_TYPE)) {
        try {
            const state = normalisePastViewState(leaf.getViewState().state)
            if (state.filePath === path) return leaf
        } catch (error) {
            log('Could not read past view state', 'debug', error)
        }
    }
    return null
}

/** The root (non-sidebar) leaf whose editor shows exactly this file. */
function findEditorLeafForFile(plugin: TimeMachinePlugin, file: TFile): WorkspaceLeaf | null {
    let match: WorkspaceLeaf | null = null

    plugin.app.workspace.iterateRootLeaves((leaf) => {
        if (match) return
        const view = leaf.view
        if (view instanceof MarkdownView && view.file?.path === file.path) {
            match = leaf
        }
    })

    return match
}
