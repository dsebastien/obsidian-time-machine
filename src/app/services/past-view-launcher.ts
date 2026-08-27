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
export async function openPastView(
    plugin: TimeMachinePlugin,
    file: TFile,
    snapshotId: string | null = null
): Promise<void> {
    const { app } = plugin

    if (file.extension !== 'md') {
        new Notice('Time Machine: Only markdown notes have a history view')
        return
    }

    const existing = findExistingPastView(plugin, file.path)
    if (existing) {
        await app.workspace.revealLeaf(existing)
        return
    }

    const targetLeaf = findEditorLeafForFile(plugin, file)

    let leaf: WorkspaceLeaf
    if (targetLeaf && canSplit(plugin)) {
        leaf = app.workspace.createLeafBySplit(targetLeaf, 'vertical', true)
    } else {
        // Mobile, a narrow workspace, or no editor showing the file: a tab is
        // the full-width past view and needs no extra handling.
        leaf = app.workspace.getLeaf('tab')
    }

    await leaf.setViewState({
        type: PAST_VIEW_TYPE,
        active: true,
        state: {
            filePath: file.path,
            boundToFile: true,
            snapshotId,
            snapshotTimestamp: null,
            showDiff: plugin.settings.pastViewDefaultShowDiff
        }
    })

    // Obsidian's own leaf pinning, unrelated to the view's `boundToFile`: it
    // stops the leaf being recycled for the next file the user opens.
    leaf.setPinned(true)
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
