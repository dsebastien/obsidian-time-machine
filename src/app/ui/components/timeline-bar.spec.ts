import { describe, expect, test, mock } from 'bun:test'
import { TimelineBarComponent } from './timeline-bar'
import { createRecording, createRecordingEl, type Recording } from '../../../test-dom'
import type { Snapshot, SnapshotSource } from '../../types/snapshot.intf'

function snap(id: string, ts: number, source: SnapshotSource = 'file-recovery'): Snapshot {
    return {
        id,
        path: 'note.md',
        ts,
        data: `d-${id}`,
        source,
        metadata:
            source === 'git'
                ? {
                      source: 'git',
                      commitHash: `${id}h`,
                      shortHash: id,
                      commitMessage: 'm',
                      authorName: 'A'
                  }
                : { source: 'file-recovery' }
    }
}

function createBar(): {
    bar: TimelineBarComponent
    rec: Recording
    onSelect: ReturnType<typeof mock>
} {
    const rec = createRecording()
    const onSelect = mock(() => {})
    const bar = new TimelineBarComponent(createRecordingEl(rec), { onSelect })
    return { bar, rec, onSelect }
}

const three = [snap('a', 3000), snap('b', 2000), snap('c', 1000)]

describe('TimelineBarComponent', () => {
    test('renders nothing for an empty history', () => {
        const { bar, rec } = createBar()
        bar.render([], null)
        expect(rec.classes.filter((c) => c.startsWith('tm-timeline-tick'))).toHaveLength(0)
    })

    test('hides the track for a single snapshot but still shows its details', () => {
        const { bar, rec } = createBar()
        bar.render([snap('a', 3000)], 'a')

        expect(rec.classes).not.toContain('tm-timeline-track')
        // The business rule keeps the selected-version information visible.
        expect(rec.classes).toContain('tm-timeline-info')
    })

    test('renders a track and one tick per snapshot', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'a')

        expect(rec.classes).toContain('tm-timeline-track')
        const ticks = rec.classes.filter(
            (c) => c === 'tm-timeline-tick' || c.startsWith('tm-timeline-tick ')
        )
        expect(ticks).toHaveLength(3)
    })

    test('marks the selected tick', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'b')
        expect(rec.classes.some((c) => c.includes('is-selected'))).toBe(true)
    })

    test('never selects anything by itself', () => {
        // It is a controlled component: the session owns selection. The old
        // slider auto-selected on render, which made selection impossible to
        // preserve across re-renders.
        const { bar, onSelect } = createBar()
        bar.render(three, null)
        expect(onSelect).not.toHaveBeenCalled()
    })

    test('clicking a tick reports that snapshot', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'a')

        const tickClick = [...rec.clicksByClass.entries()].find(
            ([cls]) => cls === 'tm-timeline-tick' || cls.startsWith('tm-timeline-tick ')
        )?.[1]
        tickClick?.()

        expect(onSelect).toHaveBeenCalled()
    })

    test('arrow keys step through history', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'b')

        const keydown = rec.keysByClass.get('tm-timeline-track')
        expect(keydown).toBeDefined()

        keydown?.({ key: 'ArrowRight', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('c')

        keydown?.({ key: 'ArrowLeft', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('a')
    })

    test('does not step past the edges', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'a')
        rec.keysByClass.get('tm-timeline-track')?.({ key: 'ArrowLeft', preventDefault: () => {} })
        expect(onSelect).not.toHaveBeenCalled()
    })

    test('exposes slider state for assistive tech', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'b')

        const attrs = rec.attrsByClass.get('tm-timeline-track') ?? {}
        expect(attrs['role']).toBe('slider')
        expect(attrs['aria-valuemin']).toBe('0')
        expect(attrs['aria-valuemax']).toBe('2')
        // 'b' is the middle of three, oldest..newest.
        expect(attrs['aria-valuenow']).toBe('1')
        expect(attrs['aria-valuetext']).toBeDefined()
    })

    test('keeps keyboard focus on the track across a re-render', () => {
        // Selecting re-renders, which destroys the focused element. Without
        // restoring focus, arrow-key navigation stopped after one keypress.
        const { bar, rec } = createBar()
        bar.render(three, 'a')

        const track = rec.focusables.get('tm-timeline-track')
        expect(track).toBeDefined()
        if (track) track.ownerDocument.activeElement = track

        bar.render(three, 'b')

        expect(rec.focused).toContain('tm-timeline-track')
    })
})
