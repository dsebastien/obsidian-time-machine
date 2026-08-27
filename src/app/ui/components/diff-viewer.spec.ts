import { describe, expect, test, mock } from 'bun:test'
import { DiffViewerComponent } from './diff-viewer'
import type { DiffViewerCallbacks } from './diff-viewer'
import type { DiffResult } from '../../types/diff.intf'
import { createRecording, createRecordingEl, type Recording } from '../../../test-dom'

function createDiff(hunks = 1): DiffResult {
    return {
        oldHeader: 'old',
        newHeader: 'new',
        hunks: Array.from({ length: hunks }, (_, i) => ({
            oldStart: i + 1,
            oldLines: 1,
            newStart: i + 1,
            newLines: 1,
            lines: ['-a', '+b'],
            renderLines: [
                { type: 'removed' as const, segments: [{ kind: 'removed' as const, text: 'a' }] },
                { type: 'added' as const, segments: [{ kind: 'added' as const, text: 'b' }] }
            ]
        }))
    }
}

function createViewer(): {
    viewer: DiffViewerComponent
    rec: Recording
    callbacks: DiffViewerCallbacks
} {
    const rec = createRecording()
    const callbacks: DiffViewerCallbacks = { onRestoreHunk: mock(() => {}) }
    const viewer = new DiffViewerComponent(createRecordingEl(rec), callbacks)
    return { viewer, rec, callbacks }
}

describe('DiffViewerComponent', () => {
    test('renders per-hunk restore buttons when allowed', () => {
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(), { allowHunkRestore: true })

        expect(rec.classes.some((c) => c.includes('tm-restore-hunk-btn'))).toBe(true)
    })

    test('hides per-hunk restore when not allowed', () => {
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(), { allowHunkRestore: false })

        expect(rec.classes.some((c) => c.includes('tm-restore-hunk-btn'))).toBe(false)
    })

    test('no longer renders the comparison toggle or full restore', () => {
        // Both moved to the owning view's header; rendering them here as well
        // would show the user two copies of each control.
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(), { allowHunkRestore: true })

        expect(rec.classes.some((c) => c.startsWith('tm-compare-mode'))).toBe(false)
        expect(rec.classes).not.toContain('tm-restore-full-btn')
    })

    test('renders an empty message when there are no differences', () => {
        const { viewer, rec } = createViewer()

        viewer.render({ oldHeader: 'old', newHeader: 'new', hunks: [] }, { allowHunkRestore: true })

        expect(rec.classes).toContain('tm-diff-no-changes')
    })

    test('renders an empty message for a null diff', () => {
        const { viewer, rec } = createViewer()

        viewer.render(null, { allowHunkRestore: true })

        expect(rec.classes).toContain('tm-diff-no-changes')
    })

    test('clicking a hunk restore button reports that hunk index', () => {
        const { viewer, rec, callbacks } = createViewer()

        viewer.render(createDiff(2), { allowHunkRestore: true })

        const click = rec.clicksByClass.get('tm-restore-hunk-btn clickable-icon')
        expect(click).toBeDefined()
        click?.({ stopPropagation: () => {} })

        expect(callbacks.onRestoreHunk).toHaveBeenCalled()
    })

    test('renders one hunk block per hunk', () => {
        const { viewer, rec } = createViewer()

        viewer.render(createDiff(3), { allowHunkRestore: true })

        expect(rec.classes.filter((c) => c === 'tm-diff-hunk')).toHaveLength(3)
    })
})
