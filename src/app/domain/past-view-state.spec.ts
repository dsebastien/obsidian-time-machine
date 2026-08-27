import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAST_VIEW_STATE, normalisePastViewState } from './past-view-state'

describe('normalisePastViewState', () => {
    test('returns defaults for undefined', () => {
        expect(normalisePastViewState(undefined)).toEqual(DEFAULT_PAST_VIEW_STATE)
    })

    test('returns defaults for null and non-objects', () => {
        expect(normalisePastViewState(null)).toEqual(DEFAULT_PAST_VIEW_STATE)
        expect(normalisePastViewState('nonsense')).toEqual(DEFAULT_PAST_VIEW_STATE)
        expect(normalisePastViewState(42)).toEqual(DEFAULT_PAST_VIEW_STATE)
    })

    test('keeps a valid false rather than falling back to the default', () => {
        // boundToFile defaults to true — a persisted `false` must survive.
        expect(normalisePastViewState({ boundToFile: false }).boundToFile).toBe(false)
    })

    test('keeps a valid true for showDiff which defaults to false', () => {
        expect(normalisePastViewState({ showDiff: true }).showDiff).toBe(true)
    })

    test('round-trips a full state', () => {
        const state = {
            filePath: 'notes/a.md',
            boundToFile: false,
            snapshotId: 'fr-1000',
            snapshotTimestamp: 1000,
            showDiff: true
        }
        expect(normalisePastViewState(state)).toEqual(state)
    })

    test('rejects wrongly typed fields', () => {
        const result = normalisePastViewState({
            filePath: 123,
            boundToFile: 'yes',
            snapshotId: {},
            snapshotTimestamp: 'soon',
            showDiff: 1
        })
        expect(result).toEqual(DEFAULT_PAST_VIEW_STATE)
    })

    test('rejects a non-finite timestamp', () => {
        expect(normalisePastViewState({ snapshotTimestamp: NaN }).snapshotTimestamp).toBeNull()
        expect(normalisePastViewState({ snapshotTimestamp: Infinity }).snapshotTimestamp).toBeNull()
    })

    test('ignores unknown keys', () => {
        const result = normalisePastViewState({ filePath: 'a.md', bogus: 'x' })
        expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_PAST_VIEW_STATE).sort())
    })
})
