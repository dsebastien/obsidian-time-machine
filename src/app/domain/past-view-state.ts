/** Persisted state of a past view, stored in the workspace layout. */
export interface PastViewState {
    /** Vault path of the note being inspected. */
    filePath: string | null
    /**
     * When true the view stays on `filePath` regardless of the active file.
     *
     * Off by default: the view follows the active note, like the sidebar panel.
     * Binding by default meant the pane went stale the moment you moved to
     * another note, and you had to notice a small toggle to fix it.
     *
     * Deliberately NOT called "pinned": Obsidian's `ViewState.pinned` means
     * something else (the leaf is not reused for navigation).
     */
    boundToFile: boolean
    /** Selected snapshot id. */
    snapshotId: string | null
    /**
     * Timestamp of the selected snapshot, persisted alongside the id so the
     * selection can fall back to the nearest surviving snapshot after a restart,
     * when the vanished snapshot is no longer around to read a timestamp from.
     */
    snapshotTimestamp: number | null
    /** Whether the body shows the diff rather than the rendered old version. */
    showDiff: boolean
}

export const DEFAULT_PAST_VIEW_STATE: PastViewState = {
    filePath: null,
    boundToFile: false,
    snapshotId: null,
    snapshotTimestamp: null,
    showDiff: false
}

/**
 * Normalises untrusted state from the workspace layout.
 *
 * `View.setState` receives `unknown`; the payload may come from an older
 * version, a hand-edited workspace file, or a future version. Defaults must not
 * clobber a valid `false`, so each field is type-checked individually rather
 * than spread.
 */
export function normalisePastViewState(state: unknown): PastViewState {
    const raw = (typeof state === 'object' && state !== null ? state : {}) as Record<
        string,
        unknown
    >

    return {
        filePath: typeof raw['filePath'] === 'string' ? raw['filePath'] : null,
        boundToFile:
            typeof raw['boundToFile'] === 'boolean'
                ? raw['boundToFile']
                : DEFAULT_PAST_VIEW_STATE.boundToFile,
        snapshotId: typeof raw['snapshotId'] === 'string' ? raw['snapshotId'] : null,
        snapshotTimestamp:
            typeof raw['snapshotTimestamp'] === 'number' &&
            Number.isFinite(raw['snapshotTimestamp'])
                ? raw['snapshotTimestamp']
                : null,
        showDiff:
            typeof raw['showDiff'] === 'boolean'
                ? raw['showDiff']
                : DEFAULT_PAST_VIEW_STATE.showDiff
    }
}
