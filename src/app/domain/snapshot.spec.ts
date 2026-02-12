import { describe, expect, test } from 'bun:test'
import type { FileRecoveryBackup } from '../types/backup.intf'
import type { Snapshot } from '../types/snapshot.intf'
import {
    deduplicateSnapshots,
    fileRecoveryToSnapshot,
    formatSnapshotLabel,
    gitCommitToSnapshot,
    mergeSnapshots,
    sortSnapshotsByDate
} from './snapshot'

describe('snapshot domain', () => {
    describe('fileRecoveryToSnapshot', () => {
        test('converts a FileRecoveryBackup to a Snapshot', () => {
            const backup: FileRecoveryBackup = {
                path: 'notes/test.md',
                ts: 1700000000000,
                data: 'file content'
            }

            const snapshot = fileRecoveryToSnapshot(backup)

            expect(snapshot.id).toBe('fr-1700000000000')
            expect(snapshot.path).toBe('notes/test.md')
            expect(snapshot.ts).toBe(1700000000000)
            expect(snapshot.data).toBe('file content')
            expect(snapshot.source).toBe('file-recovery')
            expect(snapshot.metadata).toEqual({ source: 'file-recovery' })
        })
    })

    describe('gitCommitToSnapshot', () => {
        test('creates a git Snapshot from commit data', () => {
            const snapshot = gitCommitToSnapshot(
                'notes/test.md',
                'git content',
                'abc1234567890',
                'abc1234',
                'Fix heading',
                'Alice',
                1700000000
            )

            expect(snapshot.id).toBe('git-abc1234567890')
            expect(snapshot.path).toBe('notes/test.md')
            expect(snapshot.ts).toBe(1700000000000)
            expect(snapshot.data).toBe('git content')
            expect(snapshot.source).toBe('git')
            expect(snapshot.metadata).toEqual({
                source: 'git',
                commitHash: 'abc1234567890',
                shortHash: 'abc1234',
                commitMessage: 'Fix heading',
                authorName: 'Alice'
            })
        })
    })

    describe('mergeSnapshots', () => {
        test('merges and sorts multiple sources newest-first', () => {
            const frSnapshots: Snapshot[] = [
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: 'v3' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 1000, data: 'v1' })
            ]
            const gitSnapshots: Snapshot[] = [
                gitCommitToSnapshot('a.md', 'g2', 'hash2', 'hash2s', 'msg2', 'Bob', 2),
                gitCommitToSnapshot('a.md', 'g4', 'hash4', 'hash4s', 'msg4', 'Bob', 4)
            ]

            const merged = mergeSnapshots([frSnapshots, gitSnapshots])

            expect(merged).toHaveLength(4)
            expect(merged[0]!.ts).toBe(4000)
            expect(merged[1]!.ts).toBe(3000)
            expect(merged[2]!.ts).toBe(2000)
            expect(merged[3]!.ts).toBe(1000)
        })

        test('returns empty for empty sources', () => {
            expect(mergeSnapshots([[], []])).toEqual([])
        })
    })

    describe('sortSnapshotsByDate', () => {
        test('sorts descending by timestamp', () => {
            const snapshots: Snapshot[] = [
                fileRecoveryToSnapshot({ path: 'a.md', ts: 1000, data: '' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: '' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 2000, data: '' })
            ]

            const sorted = sortSnapshotsByDate(snapshots)

            expect(sorted[0]!.ts).toBe(3000)
            expect(sorted[1]!.ts).toBe(2000)
            expect(sorted[2]!.ts).toBe(1000)
        })

        test('does not mutate original array', () => {
            const snapshots: Snapshot[] = [
                fileRecoveryToSnapshot({ path: 'a.md', ts: 1000, data: '' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: '' })
            ]

            sortSnapshotsByDate(snapshots)

            expect(snapshots[0]!.ts).toBe(1000)
        })
    })

    describe('deduplicateSnapshots', () => {
        test('keeps only the most recent snapshot per unique content', () => {
            const snapshots: Snapshot[] = [
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: 'same content' }),
                gitCommitToSnapshot('a.md', 'same content', 'h2', 'h2s', 'msg', 'Bob', 2),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 1000, data: 'same content' })
            ]

            const deduped = deduplicateSnapshots(snapshots)

            expect(deduped).toHaveLength(1)
            expect(deduped[0]!.ts).toBe(3000)
        })

        test('keeps snapshots with different content', () => {
            const snapshots: Snapshot[] = [
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: 'content A' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 2000, data: 'content B' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 1000, data: 'content C' })
            ]

            const deduped = deduplicateSnapshots(snapshots)

            expect(deduped).toHaveLength(3)
        })

        test('deduplicates across sources (git and file-recovery)', () => {
            const snapshots: Snapshot[] = [
                gitCommitToSnapshot('a.md', 'shared', 'h1', 'h1s', 'msg1', 'Alice', 4),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 3000, data: 'shared' }),
                fileRecoveryToSnapshot({ path: 'a.md', ts: 2000, data: 'unique' }),
                gitCommitToSnapshot('a.md', 'unique', 'h2', 'h2s', 'msg2', 'Bob', 1)
            ]

            const deduped = deduplicateSnapshots(snapshots)

            expect(deduped).toHaveLength(2)
            expect(deduped[0]!.ts).toBe(4000) // newest "shared"
            expect(deduped[1]!.ts).toBe(2000) // newest "unique"
        })

        test('returns empty for empty input', () => {
            expect(deduplicateSnapshots([])).toEqual([])
        })
    })

    describe('formatSnapshotLabel', () => {
        test('formats git snapshot with short hash and message', () => {
            const snapshot = gitCommitToSnapshot(
                'a.md',
                '',
                'abc1234567890',
                'abc1234',
                'Fix heading',
                'Alice',
                1700000000
            )

            expect(formatSnapshotLabel(snapshot)).toBe('abc1234: Fix heading')
        })

        test('formats file-recovery snapshot with date', () => {
            const snapshot = fileRecoveryToSnapshot({
                path: 'a.md',
                ts: 1700000000000,
                data: ''
            })

            const label = formatSnapshotLabel(snapshot)
            expect(label).toMatch(/^Snapshot \(/)
        })
    })
})
