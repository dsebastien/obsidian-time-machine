import { describe, expect, test } from 'bun:test'
import {
    computeTimelineLayout,
    findTickForSnapshot,
    resolveTier,
    stepSelection
} from './timeline-layout'
import type { Snapshot, SnapshotSource } from '../types/snapshot.intf'

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
})

describe('computeTimelineLayout', () => {
    test('returns an empty layout with no snapshots', () => {
        const layout = computeTimelineLayout([], 600)
        expect(layout.ticks).toEqual([])
        expect(layout.range).toBeNull()
    })

    test('places the newest at 0 and the oldest at 1', () => {
        const snapshots = [snap('a', 3000), snap('b', 2000), snap('c', 1000)]
        const layout = computeTimelineLayout(snapshots, 600)

        expect(layout.ticks[0]?.position).toBe(0)
        expect(layout.ticks[layout.ticks.length - 1]?.position).toBe(1)
        expect(layout.range).toEqual({ newest: 3000, oldest: 1000 })
    })

    test('positions proportionally to time, not evenly by index', () => {
        // b sits very close to a in time, far from c.
        const snapshots = [snap('a', 10_000), snap('b', 9_900), snap('c', 0)]
        const layout = computeTimelineLayout(snapshots, 10_000)

        const b = findTickForSnapshot(layout, 'b')
        expect(b?.position).toBeCloseTo(0.01, 5)
        // Even spacing would have put it at 0.5 — proving placement is time-based.
        expect(b?.position).not.toBeCloseTo(0.5, 1)
    })

    test('falls back to even spacing when every timestamp is identical', () => {
        const snapshots = [snap('a', 5000), snap('b', 5000), snap('c', 5000)]
        const layout = computeTimelineLayout(snapshots, 600)

        // No NaN, no divide-by-zero.
        for (const tick of layout.ticks) {
            expect(Number.isFinite(tick.position)).toBe(true)
        }
        expect(layout.ticks.map((t) => t.position)).toEqual([0, 0.5, 1])
    })

    test('handles a single snapshot without dividing by zero', () => {
        const layout = computeTimelineLayout([snap('a', 5000)], 600)
        expect(layout.ticks).toHaveLength(1)
        expect(layout.ticks[0]?.position).toBe(0)
        expect(layout.range).toEqual({ newest: 5000, oldest: 5000 })
    })

    test('merges near-simultaneous snapshots into a cluster tick', () => {
        // Three saves within a second, then one much older.
        const snapshots = [snap('a', 100_000), snap('b', 99_990), snap('c', 99_980), snap('d', 0)]
        const layout = computeTimelineLayout(snapshots, 400)

        expect(layout.ticks).toHaveLength(2)
        expect(layout.ticks[0]?.cluster).toBe(true)
        expect(layout.ticks[0]?.ids).toEqual(['a', 'b', 'c'])
        expect(layout.ticks[1]?.cluster).toBe(false)
    })

    test('marks a cluster spanning both sources as mixed', () => {
        const snapshots = [
            snap('a', 100_000, 'git'),
            snap('b', 99_990, 'file-recovery'),
            snap('d', 0)
        ]
        const layout = computeTimelineLayout(snapshots, 400)
        expect(layout.ticks[0]?.source).toBe('mixed')
    })

    test('keeps a single-source cluster on its own source', () => {
        const snapshots = [snap('a', 100_000, 'git'), snap('b', 99_990, 'git'), snap('d', 0)]
        const layout = computeTimelineLayout(snapshots, 400)
        expect(layout.ticks[0]?.source).toBe('git')
    })

    test('does not cluster when width is unknown', () => {
        const snapshots = [snap('a', 100_000), snap('b', 99_990), snap('c', 0)]
        const layout = computeTimelineLayout(snapshots, 0)
        expect(layout.ticks).toHaveLength(3)
    })

    test('a wider track clusters less than a narrow one', () => {
        const snapshots = [snap('a', 100_000), snap('b', 99_000), snap('c', 0)]
        expect(computeTimelineLayout(snapshots, 200).ticks.length).toBeLessThanOrEqual(
            computeTimelineLayout(snapshots, 4000).ticks.length
        )
    })
})

describe('stepSelection', () => {
    const snapshots = [snap('a', 3000), snap('b', 2000), snap('c', 1000)]

    test('steps towards older', () => {
        expect(stepSelection(snapshots, 'a', 1)).toBe('b')
    })

    test('steps towards newer', () => {
        expect(stepSelection(snapshots, 'b', -1)).toBe('a')
    })

    test('stops at the newest edge', () => {
        expect(stepSelection(snapshots, 'a', -1)).toBe('a')
    })

    test('stops at the oldest edge', () => {
        expect(stepSelection(snapshots, 'c', 1)).toBe('c')
    })

    test('visits every snapshot even when they cluster into one tick', () => {
        // The burst only collapses when the overall span dwarfs it, so `d`
        // stretches the timeline and forces a, b and c onto a single tick.
        const bursty = [snap('a', 100_000), snap('b', 99_990), snap('c', 99_980), snap('d', 0)]
        const clustered = computeTimelineLayout(bursty, 400).ticks
        expect(clustered).toHaveLength(2)
        expect(clustered[0]?.ids).toEqual(['a', 'b', 'c'])

        // Stepping walks snapshots, not ticks, so nothing is unreachable.
        expect(stepSelection(bursty, 'a', 1)).toBe('b')
        expect(stepSelection(bursty, 'b', 1)).toBe('c')
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
