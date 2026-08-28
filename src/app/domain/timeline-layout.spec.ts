import { describe, expect, test } from 'bun:test'
import {
    bucketFor,
    computeVersionRail,
    edgeSelection,
    findSegment,
    resolveTier,
    stepSelection
} from './timeline-layout'
import type { Snapshot, SnapshotSource } from '../types/snapshot.intf'

const MINUTE = 60_000
const DAY = 86_400_000

/** Fixed reference point so bucketing is deterministic. */
const NOW = new Date('2026-08-27T15:00:00Z').getTime()

function snap(id: string, ts: number, source: SnapshotSource = 'file-recovery'): Snapshot {
    return {
        id,
        path: 'note.md',
        ts,
        data: `data-${id}`,
        source,
        metadata:
            source === 'git'
                ? {
                      source: 'git',
                      commitHash: `${id}hash`,
                      shortHash: id,
                      commitMessage: 'msg',
                      authorName: 'Author'
                  }
                : { source: 'file-recovery' }
    }
}

describe('resolveTier', () => {
    test('picks a tier from the available width', () => {
        expect(resolveTier(800)).toBe('full')
        expect(resolveTier(300)).toBe('compact')
        expect(resolveTier(180)).toBe('minimal')
    })

    test('assumes room before the element has been laid out', () => {
        // Zero width means "not measured yet"; showing the most cramped tier
        // first would make the rail visibly reflow on open.
        expect(resolveTier(0)).toBe('full')
    })
})

describe('bucketFor', () => {
    test('classifies by how long ago the version is', () => {
        expect(bucketFor(NOW - MINUTE, NOW)).toBe('today')
        expect(bucketFor(NOW - DAY, NOW)).toBe('yesterday')
        expect(bucketFor(NOW - 4 * DAY, NOW)).toBe('week')
        expect(bucketFor(NOW - 20 * DAY, NOW)).toBe('month')
        expect(bucketFor(NOW - 200 * DAY, NOW)).toBe('year')
    })
    test('does not depend on the system clock', () => {
        // `bucketFor` takes `now` for a reason: using date-fns' isToday/
        // isYesterday read the real clock, so the same inputs bucketed
        // differently either side of midnight and the suite broke overnight.
        const reference = new Date('2020-01-15T12:00:00Z').getTime()
        expect(bucketFor(reference, reference)).toBe('today')
        expect(bucketFor(reference - DAY, reference)).toBe('yesterday')
        expect(bucketFor(reference - 3 * DAY, reference)).toBe('week')
    })

    test('treats a timestamp in the future as today rather than falling through', () => {
        // Clock skew between machines can hand us a snapshot dated slightly
        // ahead of now.
        expect(bucketFor(NOW + 60_000, NOW)).toBe('today')
    })
})

describe('computeVersionRail', () => {
    test('returns nothing for an empty history', () => {
        const rail = computeVersionRail([], 600, NOW)
        expect(rail.groups).toEqual([])
        expect(rail.total).toBe(0)
    })

    test('keeps every version — none are merged away', () => {
        // The previous proportional layout collapsed near-simultaneous versions
        // into one tick, which made them unreachable.
        const bursty = [
            snap('a', NOW - MINUTE),
            snap('b', NOW - MINUTE - 1000),
            snap('c', NOW - MINUTE - 2000),
            snap('d', NOW - 400 * DAY)
        ]
        const rail = computeVersionRail(bursty, 600, NOW)

        const ids = rail.groups.flatMap((g) => g.segments.map((s) => s.id))
        expect(ids).toEqual(['a', 'b', 'c', 'd'])
        expect(rail.total).toBe(4)
    })

    test('a burst and a year-old commit both stay reachable at any width', () => {
        const snapshots = [
            snap('a', NOW - MINUTE),
            snap('b', NOW - 2 * MINUTE),
            snap('c', NOW - 400 * DAY)
        ]
        for (const width of [120, 300, 1200]) {
            const rail = computeVersionRail(snapshots, width, NOW)
            expect(rail.groups.flatMap((g) => g.segments)).toHaveLength(3)
        }
    })

    test('groups consecutive versions from the same bucket together', () => {
        const snapshots = [
            snap('a', NOW - MINUTE),
            snap('b', NOW - 2 * MINUTE),
            snap('c', NOW - 4 * DAY),
            snap('d', NOW - 200 * DAY)
        ]
        const rail = computeVersionRail(snapshots, 600, NOW)

        expect(rail.groups.map((g) => g.key)).toEqual(['today', 'week', 'year'])
        expect(rail.groups[0]?.segments.map((s) => s.id)).toEqual(['a', 'b'])
    })

    test('labels every group', () => {
        const rail = computeVersionRail([snap('a', NOW - MINUTE)], 600, NOW)
        expect(rail.groups[0]?.label).toBe('Today')
        expect(rail.groups[0]?.shortLabel).toBeTruthy()
    })

    test('records each version position for announcements and stepping', () => {
        const snapshots = [snap('a', NOW - MINUTE), snap('b', NOW - 200 * DAY)]
        const rail = computeVersionRail(snapshots, 600, NOW)

        expect(rail.groups[0]?.segments[0]?.index).toBe(0)
        expect(rail.groups[1]?.segments[0]?.index).toBe(1)
    })

    test('carries the source through so git and file-recovery can differ visually', () => {
        const rail = computeVersionRail([snap('a', NOW - MINUTE, 'git')], 600, NOW)
        expect(rail.groups[0]?.segments[0]?.source).toBe('git')
    })

    test('handles identical timestamps without collapsing them', () => {
        const same = [snap('a', NOW - MINUTE), snap('b', NOW - MINUTE), snap('c', NOW - MINUTE)]
        const rail = computeVersionRail(same, 600, NOW)
        expect(rail.groups[0]?.segments).toHaveLength(3)
    })
})

describe('findSegment', () => {
    const rail = computeVersionRail([snap('a', NOW - MINUTE), snap('b', NOW - 200 * DAY)], 600, NOW)

    test('finds a version in any group', () => {
        expect(findSegment(rail, 'b')?.id).toBe('b')
    })

    test('returns null for an unknown or absent id', () => {
        expect(findSegment(rail, 'nope')).toBeNull()
        expect(findSegment(rail, null)).toBeNull()
    })
})

describe('stepSelection', () => {
    const snapshots = [snap('a', NOW - MINUTE), snap('b', NOW - 2 * MINUTE), snap('c', NOW - DAY)]

    test('steps towards older', () => {
        expect(stepSelection(snapshots, 'a', 1)).toBe('b')
    })

    test('steps towards newer', () => {
        expect(stepSelection(snapshots, 'b', -1)).toBe('a')
    })

    test('stops at both edges', () => {
        expect(stepSelection(snapshots, 'a', -1)).toBe('a')
        expect(stepSelection(snapshots, 'c', 1)).toBe('c')
    })

    test('selects the newest when nothing is selected', () => {
        expect(stepSelection(snapshots, null, 1)).toBe('a')
    })

    test('recovers when the selected id is gone', () => {
        expect(stepSelection(snapshots, 'vanished', 1)).toBe('a')
    })

    test('returns null with no snapshots', () => {
        expect(stepSelection([], 'a', 1)).toBeNull()
    })
})

describe('edgeSelection', () => {
    const snapshots = [snap('a', NOW - MINUTE), snap('b', NOW - 2 * MINUTE), snap('c', NOW - DAY)]

    test('jumps to the newest and the oldest', () => {
        expect(edgeSelection(snapshots, 'newest')).toBe('a')
        expect(edgeSelection(snapshots, 'oldest')).toBe('c')
    })

    test('returns null with no snapshots', () => {
        expect(edgeSelection([], 'newest')).toBeNull()
    })
})
