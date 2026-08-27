import type { App } from 'obsidian'
import type { PluginSettings } from '../types/plugin-settings.intf'
import type { Snapshot } from '../types/snapshot.intf'
import { SnapshotService } from './snapshot.service'

/**
 * Coalesces concurrent snapshot fetches for the same file.
 *
 * Fetching is expensive: git snapshots run one `git show` per commit,
 * sequentially, up to `gitMaxCommits`. Every open history view used to fetch
 * independently, so a sidebar plus a past view on the same note doubled that —
 * up to 100 subprocesses per poll tick. Views now share a single in-flight
 * request per (path, settings) key.
 */
export class SnapshotCache {
    private readonly inflight = new Map<string, Promise<Snapshot[]>>()

    private static key(path: string, settings: PluginSettings): string {
        // Only settings that change the *result* belong in the key.
        return `${path}::${String(settings.gitIntegrationEnabled)}::${String(settings.gitMaxCommits)}`
    }

    /**
     * Returns snapshots for `path`, joining an identical request already in
     * flight rather than starting a second one.
     */
    async get(app: App, path: string, settings: PluginSettings): Promise<Snapshot[]> {
        const key = SnapshotCache.key(path, settings)

        const existing = this.inflight.get(key)
        if (existing) return existing

        const request = SnapshotService.getSnapshots(app, path, settings).finally(() => {
            // Cleared on settle so the next poll fetches fresh data. This
            // deliberately caches nothing across ticks: snapshots change
            // underneath us and stale history is worse than a slow fetch.
            this.inflight.delete(key)
        })

        this.inflight.set(key, request)
        return request
    }

    /** Test/teardown helper. */
    clear(): void {
        this.inflight.clear()
    }
}
