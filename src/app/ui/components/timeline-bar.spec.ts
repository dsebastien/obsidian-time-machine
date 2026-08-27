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

const MINUTE = 60_000
const now = Date.now()
const three = [snap('a', now - MINUTE), snap('b', now - 2 * MINUTE), snap('c', now - 3 * MINUTE)]

describe('TimelineBarComponent', () => {
    test('renders nothing for an empty history', () => {
        const { bar, rec } = createBar()
        bar.render([], null)
        expect(rec.classes.filter((c) => c.startsWith('tm-rail-segment'))).toHaveLength(0)
    })

    test('hides the rail for a single version but still shows its details', () => {
        const { bar, rec } = createBar()
        bar.render([snap('a', now - MINUTE)], 'a')

        expect(rec.classes).not.toContain('tm-rail')
        expect(rec.classes).toContain('tm-rail-details')
    })

    test('renders one segment per version, none merged away', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'a')

        expect(rec.classes).toContain('tm-rail')
        expect(rec.classes.filter((c) => c.startsWith('tm-rail-segment'))).toHaveLength(3)
    })

    test('keeps every version reachable even in a narrow container', () => {
        // The old proportional layout merged near-simultaneous versions into a
        // single tick, so some could not be selected at all.
        const rec = createRecording()
        const onSelect = mock(() => {})
        const bar = new TimelineBarComponent(createRecordingEl(rec, '', 160), { onSelect })

        const bursty = [
            snap('a', now - MINUTE),
            snap('b', now - MINUTE - 1000),
            snap('c', now - MINUTE - 2000),
            snap('d', now - 400 * 86_400_000)
        ]
        bar.render(bursty, 'a')

        expect(rec.classes.filter((c) => c.startsWith('tm-rail-segment'))).toHaveLength(4)
    })

    test('marks the selected segment', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'b')
        expect(rec.classes.some((c) => c.includes('is-selected'))).toBe(true)
    })

    test('distinguishes git versions from file-recovery ones', () => {
        const { bar, rec } = createBar()
        bar.render([snap('a', now - MINUTE, 'git'), snap('b', now - 2 * MINUTE)], 'a')

        expect(rec.classes.some((c) => c.includes('is-git'))).toBe(true)
        expect(rec.classes.some((c) => c.includes('is-file-recovery'))).toBe(true)
    })

    test('labels time-bucket groups', () => {
        const { bar, rec } = createBar()
        bar.render([snap('a', now - MINUTE), snap('b', now - 400 * 86_400_000)], 'a')

        expect(rec.texts).toContain('Today')
        expect(rec.texts).toContain(String(new Date(now - 400 * 86_400_000).getFullYear()))
    })

    test('shows the position within the history', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'b')
        // 'b' is the middle of three, counted oldest-first.
        expect(rec.texts).toContain('2 of 3')
    })

    test('never selects anything by itself', () => {
        // It is a controlled component: the session owns selection. The old
        // slider auto-selected on render, which made selection impossible to
        // preserve across re-renders.
        const { bar, onSelect } = createBar()
        bar.render(three, null)
        expect(onSelect).not.toHaveBeenCalled()
    })

    test('clicking a segment reports that version', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'a')

        const click = [...rec.clicksByClass.entries()].find(([cls]) =>
            cls.startsWith('tm-rail-segment')
        )?.[1]
        click?.()

        expect(onSelect).toHaveBeenCalled()
    })

    test('arrow keys step through history', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'b')

        const keydown = rec.keysByClass.get('tm-rail')
        expect(keydown).toBeDefined()

        keydown?.({ key: 'ArrowRight', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('c')

        keydown?.({ key: 'ArrowLeft', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('a')
    })

    test('does not step past the edges', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'a')
        rec.keysByClass.get('tm-rail')?.({ key: 'ArrowLeft', preventDefault: () => {} })
        expect(onSelect).not.toHaveBeenCalled()
    })

    test('exposes slider state for assistive tech', () => {
        const { bar, rec } = createBar()
        bar.render(three, 'b')

        const attrs = rec.attrsByClass.get('tm-rail') ?? {}
        expect(attrs['role']).toBe('slider')
        // The value follows visual position: 1 is the leftmost (newest)
        // segment, so ArrowRight increases it, and Home/End map to min/max.
        expect(attrs['aria-valuemin']).toBe('1')
        expect(attrs['aria-valuemax']).toBe('3')
        expect(attrs['aria-valuenow']).toBe('2')
        expect(attrs['aria-valuetext']).toContain('Version 2 of 3')
    })

    test('Home and End jump to the newest and oldest versions', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render(three, 'b')

        const keydown = rec.keysByClass.get('tm-rail')
        keydown?.({ key: 'End', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('c')

        keydown?.({ key: 'Home', preventDefault: () => {} })
        expect(onSelect).toHaveBeenCalledWith('a')
    })

    test('keeps keyboard focus on the rail across a re-render', () => {
        // Selecting re-renders, which destroys the focused element. Without
        // restoring focus, arrow-key navigation stopped after one keypress.
        const { bar, rec } = createBar()
        bar.render(three, 'a')

        const rail = rec.focusables.get('tm-rail')
        expect(rail).toBeDefined()
        if (rail) rail.ownerDocument.activeElement = rail

        bar.render(three, 'b')

        expect(rec.focused).toContain('tm-rail')
    })

    test('renders every version even for a very large history', () => {
        // 300 file-recovery snapshots is an ordinary busy note. Segments hit
        // their minimum width and the rail scrolls; nothing is dropped, because
        // a version that is not rendered cannot be selected.
        const { bar, rec } = createBar()
        const many = Array.from({ length: 300 }, (_, i) => snap(`s-${String(i)}`, now - i * MINUTE))

        bar.render(many, 's-150')

        expect(rec.classes.filter((c) => c.startsWith('tm-rail-segment'))).toHaveLength(300)
        expect(rec.classes.filter((c) => c.includes('is-selected'))).toHaveLength(1)
    })

    test('always carries a value, even with nothing selected', () => {
        const { bar, rec } = createBar()
        bar.render(three, null)
        expect(rec.attrsByClass.get('tm-rail')?.['aria-valuenow']).toBe('1')
    })

    test('PageUp and PageDown move by more than one version', () => {
        const { bar, rec, onSelect } = createBar()
        const many = Array.from({ length: 40 }, (_, i) => snap(`s-${String(i)}`, now - i * MINUTE))
        bar.render(many, 's-0')

        rec.keysByClass.get('tm-rail')?.({ key: 'PageDown', preventDefault: () => {} })

        expect(onSelect).toHaveBeenCalledWith('s-10')
    })

    test('clicking a bucket label jumps to that bucket', () => {
        const { bar, rec, onSelect } = createBar()
        bar.render([snap('recent', now - MINUTE), snap('old', now - 400 * 86_400_000)], 'recent')

        const labelClicks = rec.clickList.filter((c) => c.cls.startsWith('tm-rail-group-label'))
        // The second group is the older one.
        labelClicks[1]?.fn()

        expect(onSelect).toHaveBeenCalledWith('old')
    })

    test('a version can be identified from its tooltip without selecting it', () => {
        const { bar, rec } = createBar()
        bar.render([snap('a', now - MINUTE, 'git'), snap('b', now - 2 * MINUTE)], 'b')

        // One tooltip source only: Obsidian renders aria-label, and adding a
        // native `title` too would stack two tooltips on the same element.
        const tooltips = [...rec.attrsByClass.entries()]
            .filter(([cls]) => cls.startsWith('tm-rail-segment'))
            .map(([, attrs]) => attrs['aria-label'] ?? '')
        expect(
            [...rec.attrsByClass.entries()]
                .filter(([cls]) => cls.startsWith('tm-rail-segment'))
                .every(([, attrs]) => attrs['title'] === undefined)
        ).toBe(true)

        // Position, and the source named rather than left to colour alone.
        expect(tooltips.some((t) => t.includes('Version 1 of 2'))).toBe(true)
        expect(tooltips.some((t) => t.includes('Git commit'))).toBe(true)
        expect(tooltips.some((t) => t.includes('File recovery'))).toBe(true)
    })

    test('the rail itself describes the history rather than saying nothing useful', () => {
        // Obsidian turns aria-label into a tooltip, so hovering between
        // segments used to pop a bare "Version history".
        const { bar, rec } = createBar()
        bar.render(three, 'b')

        const label = rec.attrsByClass.get('tm-rail')?.['aria-label'] ?? ''
        expect(label).toContain('3 versions')
        expect(label).toContain('newest')
        expect(label).toContain('oldest')
    })
})
