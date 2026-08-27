import { describe, expect, test, mock } from 'bun:test'
import { renderComparisonModeControl } from './comparison-mode-control'
import { createRecording, createRecordingEl } from '../../../test-dom'

describe('renderComparisonModeControl', () => {
    test('marks the active mode', () => {
        const rec = createRecording()
        renderComparisonModeControl(
            createRecordingEl(rec),
            'current',
            mock(() => {})
        )

        expect(rec.classes).toContain('tm-compare-mode-btn is-active')
        expect(rec.classes).toContain('tm-compare-mode-btn')
    })

    test('clicking the inactive mode reports the change', () => {
        const rec = createRecording()
        const onChange = mock(() => {})
        renderComparisonModeControl(createRecordingEl(rec), 'current', onChange)

        // In `current` mode the plain (non-active) button is "next".
        rec.clicksByClass.get('tm-compare-mode-btn')?.()

        expect(onChange).toHaveBeenCalledWith('next')
    })

    test('clicking the already-active mode reports nothing', () => {
        const rec = createRecording()
        const onChange = mock(() => {})
        renderComparisonModeControl(createRecordingEl(rec), 'current', onChange)

        rec.clicksByClass.get('tm-compare-mode-btn is-active')?.()

        expect(onChange).not.toHaveBeenCalled()
    })

    test('reflects next mode as the active one', () => {
        const rec = createRecording()
        const onChange = mock(() => {})
        renderComparisonModeControl(createRecordingEl(rec), 'next', onChange)

        rec.clicksByClass.get('tm-compare-mode-btn')?.()

        expect(onChange).toHaveBeenCalledWith('current')
    })

    test('exposes pressed state for assistive tech', () => {
        const rec = createRecording()
        renderComparisonModeControl(
            createRecordingEl(rec),
            'current',
            mock(() => {})
        )

        expect(rec.attrsByClass.get('tm-compare-mode-btn is-active')?.['aria-pressed']).toBe('true')
        expect(rec.attrsByClass.get('tm-compare-mode-btn')?.['aria-pressed']).toBe('false')
    })
})
