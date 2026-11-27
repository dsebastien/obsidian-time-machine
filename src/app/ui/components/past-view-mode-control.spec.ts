import { describe, expect, mock, test } from 'bun:test'
import { createRecording, createRecordingEl } from '../../../../test/dom'
import { renderPastViewModeControl } from './past-view-mode-control'

describe('renderPastViewModeControl', () => {
    test('selects the note version from changes', () => {
        const rec = createRecording()
        const onChange = mock(() => {})
        renderPastViewModeControl(createRecordingEl(rec), true, onChange)

        expect(rec.texts).toContain('Showing changes')
        expect(rec.texts).toContain('Show note version')
        expect(rec.attrsByClass.get('tm-past-diff-toggle is-active')?.['aria-pressed']).toBe('true')
        expect(rec.attrsByClass.get('tm-past-diff-toggle')?.['aria-pressed']).toBe('false')
        rec.clicksByClass.get('tm-past-diff-toggle')?.()
        expect(onChange).toHaveBeenCalledWith(false)
        rec.clicksByClass.get('tm-past-diff-toggle is-active')?.()
        expect(onChange).toHaveBeenCalledTimes(1)
    })

    test('returns to changes from the note version', () => {
        const rec = createRecording()
        const onChange = mock(() => {})
        renderPastViewModeControl(createRecordingEl(rec), false, onChange)

        expect(rec.texts).toContain('Show changes')
        expect(rec.texts).toContain('Show note version')
        rec.clicksByClass.get('tm-past-diff-toggle')?.()
        expect(onChange).toHaveBeenCalledWith(true)
        rec.clicksByClass.get('tm-past-diff-toggle is-active')?.()
        expect(onChange).toHaveBeenCalledTimes(1)
    })
})
