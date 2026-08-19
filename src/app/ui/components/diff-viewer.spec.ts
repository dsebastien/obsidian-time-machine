import { describe, expect, test, mock } from 'bun:test'
import { DiffViewerComponent } from './diff-viewer'
import type { DiffViewerCallbacks } from './diff-viewer'
import type { DiffResult } from '../../types/diff.intf'

/**
 * Recording mock DOM: collects every created element's class string and the
 * click handler registered on it, so tests can assert what got rendered and
 * simulate clicks by class.
 */
interface Recording {
    classes: string[]
    clicksByClass: Map<string, () => void>
}

function createRecordingEl(rec: Recording, ownCls = ''): HTMLElement {
    const child = (cls?: string): HTMLElement => {
        if (cls) rec.classes.push(cls)
        return createRecordingEl(rec, cls ?? '')
    }
    const el = {
        empty: () => {},
        createDiv: (opts?: { cls?: string }) => child(opts?.cls),
        createSpan: (opts?: { cls?: string }) => child(opts?.cls),
        createEl: (_tag: string, opts?: { cls?: string }) => child(opts?.cls),
        addEventListener: (type: string, fn: () => void) => {
            if (type === 'click') rec.clicksByClass.set(ownCls, fn)
        },
        prepend: () => {}
    }
    return el as unknown as HTMLElement
}

function createDiff(): DiffResult {
    return {
        oldHeader: 'old',
        newHeader: 'new',
        hunks: [
            {
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 1,
                lines: ['-a', '+b'],
                renderLines: [
                    { type: 'removed', segments: [{ kind: 'removed', text: 'a' }] },
                    { type: 'added', segments: [{ kind: 'added', text: 'b' }] }
                ]
            }
        ]
    }
}

function createViewer(): {
    viewer: DiffViewerComponent
    rec: Recording
    callbacks: DiffViewerCallbacks
} {
    const rec: Recording = { classes: [], clicksByClass: new Map() }
    const callbacks: DiffViewerCallbacks = {
        onRestoreFullVersion: mock(() => {}),
        onRestoreHunk: mock(() => {}),
        onComparisonModeChange: mock(() => {})
    }
    const viewer = new DiffViewerComponent(createRecordingEl(rec), callbacks)
    return { viewer, rec, callbacks }
}

describe('DiffViewerComponent', () => {
    test('current mode renders the mode toggle and per-hunk restore buttons', () => {
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(), 'current')

        expect(rec.classes).toContain('tm-compare-mode-btn is-active')
        expect(rec.classes).toContain('tm-compare-mode-btn')
        expect(rec.classes).toContain('tm-restore-full-btn')
        expect(rec.classes.some((c) => c.includes('tm-restore-hunk-btn'))).toBe(true)
    })

    test('next mode hides per-hunk restore but keeps full restore', () => {
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(), 'next')

        expect(rec.classes.some((c) => c.includes('tm-restore-hunk-btn'))).toBe(false)
        expect(rec.classes).toContain('tm-restore-full-btn')
    })

    test('clicking the inactive mode button fires onComparisonModeChange', () => {
        const { viewer, rec, callbacks } = createViewer()

        viewer.render(createDiff(), 'current')

        // In current mode, the plain (non-active) class is the "next" button
        const nextBtnClick = rec.clicksByClass.get('tm-compare-mode-btn')
        expect(nextBtnClick).toBeDefined()
        nextBtnClick!()

        expect(callbacks.onComparisonModeChange).toHaveBeenCalledWith('next')
    })

    test('clicking the active mode button does not fire onComparisonModeChange', () => {
        const { viewer, rec, callbacks } = createViewer()

        viewer.render(createDiff(), 'current')

        const activeBtnClick = rec.clicksByClass.get('tm-compare-mode-btn is-active')
        expect(activeBtnClick).toBeDefined()
        activeBtnClick!()

        expect(callbacks.onComparisonModeChange).not.toHaveBeenCalled()
    })

    test('mode toggle stays visible when there are no differences', () => {
        const { viewer, rec } = createViewer()

        viewer.render({ oldHeader: 'old', newHeader: 'new', hunks: [] }, 'next')

        expect(rec.classes.some((c) => c.startsWith('tm-compare-mode-btn'))).toBe(true)
        expect(rec.classes).toContain('tm-diff-no-changes')
    })
})
