import { describe, expect, test } from 'bun:test'
import type { App } from 'obsidian'
import { GitService } from './git.service'

function createMockApp(): App {
    return { vault: { adapter: {} } } as unknown as App
}

describe('GitService', () => {
    describe('getVaultBasePath', () => {
        test('returns null when adapter is not FileSystemAdapter', () => {
            const result = GitService.getVaultBasePath(createMockApp())
            expect(result).toBeNull()
        })
    })

    describe('isAvailable', () => {
        test('returns false when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.isAvailable(createMockApp())
            expect(result).toBe(false)
        })
    })

    describe('getCommitsForFile', () => {
        test('returns empty array when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.getCommitsForFile(createMockApp(), 'test.md', 10)
            expect(result).toEqual([])
        })
    })

    describe('getFileAtCommit', () => {
        test('returns null when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.getFileAtCommit(createMockApp(), 'abc123', 'test.md')
            expect(result).toBeNull()
        })
    })

    describe('isFileTracked', () => {
        test('returns false when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.isFileTracked(createMockApp(), 'test.md')
            expect(result).toBe(false)
        })
    })
})
