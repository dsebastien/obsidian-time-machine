export interface PluginSettings {
    /** Whether git commit snapshots are shown on the timeline (desktop only) */
    gitIntegrationEnabled: boolean
    /** Maximum number of git commits to fetch per file */
    gitMaxCommits: number
}

export const DEFAULT_SETTINGS: PluginSettings = {
    gitIntegrationEnabled: true,
    gitMaxCommits: 50
}
