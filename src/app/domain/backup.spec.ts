import { describe, expect, test } from 'bun:test'
import { sortBackupsByDate, formatBackupDate, formatRelativeTime } from './backup'
import type { FileRecoveryBackup } from '../types/backup.intf'

describe('backup domain utilities', () => {
    const mockBackups: FileRecoveryBackup[] = [
        { path: 'test.md', ts: 1000, data: 'old' },
        { path: 'test.md', ts: 3000, data: 'newest' },
        { path: 'test.md', ts: 2000, data: 'middle' }
    ]

    describe('sortBackupsByDate', () => {
        test('sorts backups descending by timestamp', () => {
            const sorted = sortBackupsByDate(mockBackups)
            expect(sorted[0]!.ts).toBe(3000)
            expect(sorted[1]!.ts).toBe(2000)
            expect(sorted[2]!.ts).toBe(1000)
        })

        test('does not mutate the original array', () => {
            const original = [...mockBackups]
            sortBackupsByDate(mockBackups)
            expect(mockBackups).toEqual(original)
        })

        test('handles empty array', () => {
            expect(sortBackupsByDate([])).toEqual([])
        })

        test('handles single element', () => {
            const single = [{ path: 'a.md', ts: 100, data: 'x' }]
            const sorted = sortBackupsByDate(single)
            expect(sorted).toHaveLength(1)
            expect(sorted[0]!.ts).toBe(100)
        })
    })

    describe('formatBackupDate', () => {
        test('formats timestamp to yyyy-MM-dd HH:mm', () => {
            // 2024-01-15 10:30:00 UTC
            const ts = new Date('2024-01-15T10:30:00Z').getTime()
            const formatted = formatBackupDate(ts)
            // The exact output depends on timezone, but it should match the pattern
            expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        })
    })

    describe('formatRelativeTime', () => {
        test('returns a human-readable relative time string', () => {
            const recent = Date.now() - 60 * 1000 // 1 minute ago
            const result = formatRelativeTime(recent)
            expect(result).toContain('ago')
        })

        test('handles older timestamps', () => {
            const old = Date.now() - 24 * 60 * 60 * 1000 // 1 day ago
            const result = formatRelativeTime(old)
            expect(result).toContain('ago')
        })
    })
})
