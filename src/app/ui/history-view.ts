import type { TFile } from 'obsidian'

/**
 * What the plugin needs from a view that displays a note's history.
 *
 * Both the sidebar view and the past view implement this, so plugin-level
 * routing (file-open, cursor following, content refresh, snapshot polling,
 * comparison-mode broadcast) works against one contract instead of one concrete
 * class. `getActiveViews()` previously returned only the sidebar type, so
 * broadening it naively would have made pinned past views follow files.
 */
export interface HistoryView {
    containerEl: HTMLElement
    getCurrentFile(): TFile | null
    /** Re-fetch snapshots and re-render for a file. */
    updateForFile(file: TFile | null): Promise<void>
    /** Cheap re-filter + re-diff against changed file content; no re-fetch. */
    refreshCurrentContent(): Promise<void>
    /** The shared comparison-mode setting changed elsewhere; re-render. */
    onComparisonModeChanged(): void
    /**
     * Whether this view should switch when the active file changes. The sidebar
     * always does; a past view does only while unbound.
     */
    followsActiveFile(): boolean
}
