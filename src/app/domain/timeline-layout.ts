import type { Snapshot, SnapshotSource } from '../types/snapshot.intf'

/**
 * Pure layout maths for the timeline bar.
 *
 * Kept free of the DOM so the awkward parts — proportional positioning,
 * clustering of near-simultaneous snapshots, the all-same-timestamp edge case —
 * are testable without faking element geometry.
 */

/** Rendering density, chosen from the available width. */
export type TimelineTier = 'full' | 'compact' | 'minimal'

export interface TimelineTick {
    /** Snapshot ids represented by this tick, newest first. */
    ids: string[]
    /** Fraction of the track, 0 = left (newest) .. 1 = right (oldest). */
    position: number
    /** Timestamp of the representative (newest) snapshot. */
    ts: number
    /** Icon source; `mixed` when a cluster spans both sources. */
    source: SnapshotSource | 'mixed'
    /** True when this tick stands for more than one snapshot. */
    cluster: boolean
}

export interface TimelineLayout {
    tier: TimelineTier
    ticks: TimelineTick[]
    /** Newest and oldest timestamps, or null when there are no snapshots. */
    range: { newest: number; oldest: number } | null
}

/** Width thresholds, in pixels. */
const TIER_COMPACT_BELOW = 420
const TIER_MINIMAL_BELOW = 240

/** Minimum gap between two ticks before they merge into a cluster. */
const MIN_TICK_GAP_PX = 10

export function resolveTier(width: number): TimelineTier {
    if (width < TIER_MINIMAL_BELOW) return 'minimal'
    if (width < TIER_COMPACT_BELOW) return 'compact'
    return 'full'
}

/**
 * Positions ticks proportionally to time, left = newest.
 *
 * Proportional (not evenly-by-index) placement is the point: twenty saves in
 * one minute should look like a burst, not like a month of history.
 *
 * @param snapshots newest-first, as everywhere else in the plugin
 * @param width available track width in pixels
 */
export function computeTimelineLayout(snapshots: Snapshot[], width: number): TimelineLayout {
    const tier = resolveTier(width)

    if (snapshots.length === 0) {
        return { tier, ticks: [], range: null }
    }

    const newest = snapshots[0]?.ts ?? 0
    const oldest = snapshots[snapshots.length - 1]?.ts ?? newest
    const span = newest - oldest

    // Every snapshot shares a timestamp (or there is only one): proportional
    // placement is undefined, so fall back to even spacing rather than
    // dividing by zero.
    const positionOf = (ts: number, index: number): number => {
        if (span <= 0) {
            return snapshots.length === 1 ? 0 : index / (snapshots.length - 1)
        }
        return (newest - ts) / span
    }

    const raw = snapshots.map((snapshot, index) => ({
        snapshot,
        position: positionOf(snapshot.ts, index)
    }))

    // Merge ticks that would overlap. `width <= 0` means we have no geometry yet
    // (first render before layout), so skip clustering rather than collapsing
    // everything into one tick.
    const minGap = width > 0 ? MIN_TICK_GAP_PX / width : 0

    const ticks: TimelineTick[] = []
    for (const { snapshot, position } of raw) {
        const previous = ticks[ticks.length - 1]
        if (previous && minGap > 0 && position - previous.position < minGap) {
            previous.ids.push(snapshot.id)
            previous.cluster = true
            if (previous.source !== 'mixed' && previous.source !== snapshot.source) {
                previous.source = 'mixed'
            }
            continue
        }

        ticks.push({
            ids: [snapshot.id],
            position,
            ts: snapshot.ts,
            source: snapshot.source,
            cluster: false
        })
    }

    return { tier, ticks, range: { newest, oldest } }
}

/** The tick representing a snapshot id, or null when it is not on the timeline. */
export function findTickForSnapshot(
    layout: TimelineLayout,
    id: string | null
): TimelineTick | null {
    if (id === null) return null
    return layout.ticks.find((tick) => tick.ids.includes(id)) ?? null
}

/**
 * Neighbour of `id` for keyboard stepping.
 *
 * Stepping walks the underlying snapshots, never the ticks, so a cluster does
 * not swallow the snapshots merged into it.
 *
 * @param direction `-1` towards newer, `+1` towards older
 */
export function stepSelection(
    snapshots: Snapshot[],
    id: string | null,
    direction: -1 | 1
): string | null {
    if (snapshots.length === 0) return null
    if (id === null) return snapshots[0]?.id ?? null

    const index = snapshots.findIndex((snapshot) => snapshot.id === id)
    if (index === -1) return snapshots[0]?.id ?? null

    const next = index + direction
    if (next < 0 || next >= snapshots.length) return id
    return snapshots[next]?.id ?? id
}
