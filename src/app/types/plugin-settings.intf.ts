/**
 * Which newer version the selected snapshot is diffed against.
 * - `current`: selected snapshot → current file content (cumulative drift).
 * - `next`: selected snapshot → the chronologically next (newer) snapshot
 *   (incremental change per step). The newest snapshot's "next" is the current
 *   file content, so both modes agree at the newest position.
 */
export type DiffComparisonMode = 'current' | 'next'

export interface PluginSettings {
    /** Whether git commit snapshots are shown on the timeline (desktop only) */
    gitIntegrationEnabled: boolean
    /** Maximum number of git commits to fetch per file */
    gitMaxCommits: number
    /** Last chosen diff comparison mode (persisted from the in-panel toggle) */
    diffComparisonMode: DiffComparisonMode
}

export const DEFAULT_SETTINGS: PluginSettings = {
    gitIntegrationEnabled: true,
    gitMaxCommits: 50,
    diffComparisonMode: 'current'
}
