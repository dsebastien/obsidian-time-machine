import type { App, TFile } from 'obsidian'
import type { PluginSettings } from '../types/plugin-settings.intf'
import type { Snapshot, GitMetadata } from '../types/snapshot.intf'
import type { DiffResult } from '../types/diff.intf'
import { SnapshotCache } from '../services/snapshot-cache'
import { DiffService } from '../services/diff.service'
import { formatBackupDate } from './backup'
import { log } from '../../utils/log'

/** Outcome of an async session operation. `superseded` means a newer call won. */
export type SessionOutcome = 'updated' | 'unchanged' | 'superseded'

export interface SessionDiff {
    diff: DiffResult
    /** Content the diff was computed against — what hunk restore is addressed to. */
    baseContent: string
    /** True when the diff compares two historical versions, not the live file. */
    historical: boolean
}

/**
 * The snapshot state behind a history view: which file, which snapshots, which
 * one is selected, and the diff for it.
 *
 * Extracted from `TimeMachineView` so the sidebar and the past view share one
 * implementation instead of each owning a private copy. Selection is tracked by
 * snapshot **id**, not index: indices shift as snapshots arrive, get deduped,
 * or get filtered against the current content.
 */
export class SnapshotSession {
    private readonly getApp: () => App
    private readonly cache: SnapshotCache
    private readonly getSettings: () => PluginSettings

    /**
     * Monotonic generation for snapshot *loading*. `loadFor` and
     * `refreshContent` capture it on entry and report `superseded` if a newer
     * load started meanwhile, so a slow git fetch can never overwrite fresher
     * results.
     */
    private dataGeneration = 0

    /**
     * Separate generation for diff computation. Diffing must NOT share the load
     * counter: scrubbing the timeline computes diffs continuously, and a shared
     * counter would make every scrub cancel an in-flight snapshot fetch, so a
     * poll landing during interaction would be silently thrown away.
     */
    private diffGeneration = 0

    file: TFile | null = null
    allSnapshots: Snapshot[] = []
    /** Snapshots that actually differ from the current file content. */
    snapshots: Snapshot[] = []

    private selectedId: string | null = null
    /**
     * Timestamp of the selected snapshot, kept alongside the id so a selection
     * can survive the snapshot disappearing (dedup, filtering, restart) by
     * falling back to the nearest surviving one in time.
     */
    private selectedTs: number | null = null

    diffBaseContent: string | null = null

    /**
     * `getApp` is a accessor rather than a value because a view's `app` is
     * assigned by Obsidian's `View` base class, so it is not necessarily the
     * same object at construction time as when the session first runs.
     */
    constructor(getApp: () => App, cache: SnapshotCache, getSettings: () => PluginSettings) {
        this.getApp = getApp
        this.cache = cache
        this.getSettings = getSettings
    }

    private get app(): App {
        return this.getApp()
    }

    get selectedSnapshot(): Snapshot | null {
        if (this.selectedId === null) return null
        return this.snapshots.find((s) => s.id === this.selectedId) ?? null
    }

    get selectedIndex(): number | null {
        if (this.selectedId === null) return null
        const index = this.snapshots.findIndex((s) => s.id === this.selectedId)
        return index === -1 ? null : index
    }

    getSelectedId(): string | null {
        return this.selectedId
    }

    getSelectedTs(): number | null {
        return this.selectedTs
    }

    /** Restores a persisted selection before any snapshots are loaded. */
    restoreSelection(id: string | null, ts: number | null): void {
        this.selectedId = id
        this.selectedTs = ts
    }

    select(id: string | null): void {
        this.selectedId = id
        this.selectedTs = id === null ? null : (this.snapshots.find((s) => s.id === id)?.ts ?? null)
    }

    /** Loads snapshots for a file. Returns `superseded` if a newer load started. */
    async loadFor(file: TFile | null): Promise<SessionOutcome> {
        const generation = ++this.dataGeneration

        if (!file) {
            this.file = null
            this.allSnapshots = []
            this.snapshots = []
            this.selectedId = null
            this.selectedTs = null
            this.diffBaseContent = null
            return 'updated'
        }

        this.file = file
        this.diffBaseContent = null

        let fetched: Snapshot[]
        try {
            fetched = await this.cache.get(this.app, file.path, this.getSettings())
        } catch (error) {
            log('Failed to fetch snapshots', 'error', error)
            fetched = []
        }
        if (generation !== this.dataGeneration) return 'superseded'

        this.allSnapshots = fetched

        if (fetched.length === 0) {
            this.snapshots = []
            this.reconcileSelection()
            return 'updated'
        }

        const currentContent = await this.app.vault.read(file)
        if (generation !== this.dataGeneration) return 'superseded'

        this.snapshots = fetched.filter((snapshot) => snapshot.data !== currentContent)
        this.reconcileSelection()
        return 'updated'
    }

    /**
     * Re-filters the cached snapshots against the current file content, without
     * re-fetching from git/IndexedDB. Returns `updated` when the filtered set
     * changed (so the caller must re-render), `unchanged` otherwise.
     */
    async refreshContent(): Promise<SessionOutcome> {
        if (!this.file) return 'unchanged'
        const generation = ++this.dataGeneration

        const currentContent = await this.app.vault.read(this.file)
        if (generation !== this.dataGeneration) return 'superseded'

        const previous = this.snapshots
        this.snapshots = this.allSnapshots.filter((snapshot) => snapshot.data !== currentContent)

        const changed =
            previous.length !== this.snapshots.length ||
            previous.some((snapshot, i) => snapshot.id !== this.snapshots[i]?.id)

        if (changed) this.reconcileSelection()
        return changed ? 'updated' : 'unchanged'
    }

    /**
     * Keeps the selection pointing at something sensible after the snapshot list
     * changes: the same snapshot if it survived, otherwise the nearest surviving
     * one in time, otherwise the newest.
     */
    private reconcileSelection(): void {
        if (this.snapshots.length === 0) {
            this.selectedId = null
            this.selectedTs = null
            return
        }

        if (this.selectedId !== null && this.snapshots.some((s) => s.id === this.selectedId)) {
            return
        }

        if (this.selectedTs !== null) {
            const target = this.selectedTs
            let nearest = this.snapshots[0]
            if (nearest) {
                let bestDistance = Math.abs(nearest.ts - target)
                for (const snapshot of this.snapshots) {
                    const distance = Math.abs(snapshot.ts - target)
                    // `<` keeps the newer one on a tie: `snapshots` is newest-first.
                    if (distance < bestDistance) {
                        bestDistance = distance
                        nearest = snapshot
                    }
                }
                this.selectedId = nearest.id
                this.selectedTs = nearest.ts
                return
            }
        }

        const newest = this.snapshots[0]
        this.selectedId = newest?.id ?? null
        this.selectedTs = newest?.ts ?? null
    }

    /**
     * Computes the diff for the current selection under the active comparison
     * mode. Records the content it diffed against on `diffBaseContent`.
     */
    async computeDiff(): Promise<SessionDiff | null> {
        const index = this.selectedIndex
        const snapshot = this.selectedSnapshot
        if (index === null || !snapshot || !this.file) return null

        const generation = ++this.diffGeneration
        const currentContent = await this.app.vault.read(this.file)
        if (generation !== this.diffGeneration) return null

        const mode = this.getSettings().diffComparisonMode

        // `snapshots` is newest-first, so the chronologically next (newer)
        // version of snapshots[i] is snapshots[i - 1]. The newest snapshot's
        // next is the live file, so both modes agree at index 0.
        const nextSnapshot = mode === 'next' && index > 0 ? this.snapshots[index - 1] : null
        const newContent = nextSnapshot ? nextSnapshot.data : currentContent
        const newLabel = nextSnapshot ? formatDiffLabel(nextSnapshot) : 'Current'

        const diff = DiffService.computeDiff(
            snapshot.data,
            newContent,
            formatDiffLabel(snapshot),
            newLabel
        )

        this.diffBaseContent = currentContent
        return { diff, baseContent: currentContent, historical: nextSnapshot !== null }
    }
}

/** Human label for a snapshot in diff headers. */
export function formatDiffLabel(snapshot: Snapshot): string {
    if (snapshot.source === 'git') {
        const meta = snapshot.metadata as GitMetadata
        return `Commit ${meta.shortHash} (${formatBackupDate(snapshot.ts)})`
    }
    return `Snapshot (${new Date(snapshot.ts).toLocaleString()})`
}
