import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns'
import type { Snapshot, SnapshotSource } from '../types/snapshot.intf'

/**
 * Layout model for the version rail.
 *
 * The first design positioned ticks proportionally to their timestamp. That is
 * faithful to time and useless for browsing: real history is exponentially
 * distributed — a handful of saves in the last ten minutes, then commits days,
 * months and a year back — so everything collapsed into the newest sliver of
 * the track with a huge dead gap and a single tick at the far end. Versions
 * closer together than a few pixels had to be merged away, which made half of
 * them unreachable.
 *
 * Versions are now equal-width segments, so every one is visible and clickable
 * whatever its timestamp, and temporal context is carried by grouping them into
 * labelled time buckets instead of by position.
 */

/** Rendering density, chosen from the available width. */
export type RailTier = 'full' | 'compact' | 'minimal'

export type BucketKey = 'today' | 'yesterday' | 'week' | 'month' | 'year'

export interface RailSegment {
    id: string
    ts: number
    source: SnapshotSource
    /** Position in the full newest-first list, for stepping and announcements. */
    index: number
}

export interface RailGroup {
    key: BucketKey
    /** Stable identity; year buckets differ per calendar year. */
    id: string
    label: string
    /** Shorter label for narrow containers. */
    shortLabel: string
    segments: RailSegment[]
}

export interface VersionRail {
    tier: RailTier
    groups: RailGroup[]
    /** Total number of versions, across all groups. */
    total: number
}

/** Width thresholds, in pixels. */
const TIER_COMPACT_BELOW = 460
const TIER_MINIMAL_BELOW = 260

export function resolveTier(width: number): RailTier {
    // Zero means the element has not been laid out yet; assume there is room
    // rather than flashing the most cramped tier first.
    if (width === 0) return 'full'
    if (width < TIER_MINIMAL_BELOW) return 'minimal'
    if (width < TIER_COMPACT_BELOW) return 'compact'
    return 'full'
}

/**
 * Labels are short on purpose. "Earlier this week" and "Earlier this month"
 * both truncate to "EARLIER TH…" in a group only a few segments wide, which
 * tells the reader nothing and makes two groups look identical.
 */
/**
 * Labels are rolling windows, and say so. "This week" was a false claim: a
 * version from six days ago can easily belong to the previous calendar week,
 * and one from three weeks ago to the previous month.
 *
 * Anything past a month is labelled by year rather than lumped into "Older",
 * which otherwise swallowed everything from one month to ten years old into a
 * single undifferentiated group.
 */
const BUCKET_LABELS: Record<Exclude<BucketKey, 'year'>, { label: string; shortLabel: string }> = {
    today: { label: 'Today', shortLabel: 'Today' },
    yesterday: { label: 'Yesterday', shortLabel: 'Yest.' },
    week: { label: 'Last 7 days', shortLabel: '7 days' },
    month: { label: 'Last 30 days', shortLabel: '30 days' }
}

/** Which time bucket a timestamp falls into, relative to `now`. */
export function bucketFor(ts: number, now: number): BucketKey {
    if (isToday(ts)) return 'today'
    if (isYesterday(ts)) return 'yesterday'

    const days = differenceInCalendarDays(now, ts)
    if (days <= 7) return 'week'
    if (days <= 30) return 'month'
    return 'year'
}

/**
 * Identity of the group a snapshot belongs to. Year buckets are split per
 * calendar year, so a long history reads as 2026 / 2025 / 2024 rather than one
 * enormous "Older".
 */
function groupIdFor(ts: number, now: number): { key: BucketKey; id: string } {
    const key = bucketFor(ts, now)
    return key === 'year'
        ? { key, id: `year-${String(new Date(ts).getFullYear())}` }
        : { key, id: key }
}

function labelsFor(key: BucketKey, ts: number): { label: string; shortLabel: string } {
    if (key === 'year') {
        const year = String(new Date(ts).getFullYear())
        return { label: year, shortLabel: year }
    }
    return BUCKET_LABELS[key]
}

/**
 * Groups snapshots into the rail model.
 *
 * @param snapshots newest-first, as everywhere else in the plugin
 * @param width available width in pixels, used only to pick a tier
 * @param now reference time for bucketing; injected so tests are deterministic
 */
export function computeVersionRail(snapshots: Snapshot[], width: number, now: number): VersionRail {
    const tier = resolveTier(width)
    const groups: RailGroup[] = []

    snapshots.forEach((snapshot, index) => {
        const { key, id } = groupIdFor(snapshot.ts, now)
        const segment: RailSegment = {
            id: snapshot.id,
            ts: snapshot.ts,
            source: snapshot.source,
            index
        }

        const last = groups[groups.length - 1]
        // Snapshots are ordered, so a bucket is always contiguous; only the
        // most recent group can be extended.
        if (last && last.id === id) {
            last.segments.push(segment)
            return
        }

        groups.push({ key, id, ...labelsFor(key, snapshot.ts), segments: [segment] })
    })

    return { tier, groups, total: snapshots.length }
}

/** The segment for a snapshot id, or null when it is not on the rail. */
export function findSegment(rail: VersionRail, id: string | null): RailSegment | null {
    if (id === null) return null
    for (const group of rail.groups) {
        const found = group.segments.find((segment) => segment.id === id)
        if (found) return found
    }
    return null
}

/**
 * Neighbour of `id` for keyboard stepping.
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

/**
 * Steps by a page. With hundreds of versions, one-at-a-time arrows mean
 * hundreds of keypresses to reach the middle.
 */
export function pageSelection(
    snapshots: Snapshot[],
    id: string | null,
    direction: -1 | 1,
    pageSize = 10
): string | null {
    if (snapshots.length === 0) return null
    const current = id === null ? 0 : snapshots.findIndex((snapshot) => snapshot.id === id)
    const from = current === -1 ? 0 : current
    const target = Math.min(snapshots.length - 1, Math.max(0, from + direction * pageSize))
    return snapshots[target]?.id ?? id
}

/** First (newest) or last (oldest) version, for Home/End. */
export function edgeSelection(snapshots: Snapshot[], edge: 'newest' | 'oldest'): string | null {
    if (snapshots.length === 0) return null
    return (edge === 'newest' ? snapshots[0]?.id : snapshots[snapshots.length - 1]?.id) ?? null
}
