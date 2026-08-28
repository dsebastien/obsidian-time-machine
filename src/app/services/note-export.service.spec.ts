import { describe, expect, test, mock } from 'bun:test'
import type { App, TFile } from 'obsidian'
import { NoteExportService } from './note-export.service'

function createFile(path: string, parentPath: string | null): TFile {
    const basename = (path.split('/').pop() ?? path).replace(/\.md$/, '')
    const stub = {
        path,
        basename,
        name: `${basename}.md`,
        parent: parentPath === null ? null : { path: parentPath }
    }
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- test fixture: a real TFile cannot be constructed outside Obsidian
    return stub as unknown as TFile
}

function createApp(create: (path: string, data: string) => Promise<unknown>): App {
    return { vault: { create } } as unknown as App
}

const ts = Date.UTC(2026, 7, 27, 14, 30)

describe('NoteExportService.createFromSnapshot', () => {
    test('writes beside the source note using a timestamped name', async () => {
        const paths: string[] = []
        const app = createApp((path) => {
            paths.push(path)
            return Promise.resolve({ name: path })
        })

        await NoteExportService.createFromSnapshot(
            app,
            createFile('notes/deep/Note.md', 'notes/deep'),
            'content',
            ts
        )

        expect(paths[0]).toMatch(/^notes\/deep\/Note \(2026-08-27 \d\d-\d\d\)\.md$/)
    })

    test('does not produce a leading slash for a note at the vault root', async () => {
        const paths: string[] = []
        const app = createApp((path) => {
            paths.push(path)
            return Promise.resolve({ name: path })
        })

        await NoteExportService.createFromSnapshot(app, createFile('Note.md', '/'), 'content', ts)

        expect(paths[0]?.startsWith('/')).toBe(false)
    })

    test('retries with a numeric suffix when the name is taken', async () => {
        const paths: string[] = []
        const app = createApp((path) => {
            paths.push(path)
            if (paths.length < 3) {
                return Promise.reject(new Error('File already exists.'))
            }
            return Promise.resolve({ name: path })
        })

        const created = await NoteExportService.createFromSnapshot(
            app,
            createFile('Note.md', ''),
            'content',
            ts
        )

        expect(created).not.toBeNull()
        expect(paths).toHaveLength(3)
        expect(paths[2]).toMatch(/ 3\.md$/)
    })

    test('gives up immediately on a non-collision failure', async () => {
        // Retrying a permission error twenty times would bury the real reason.
        const create = mock(() => Promise.reject(new Error('EACCES: permission denied')))
        const app = createApp(create)

        const created = await NoteExportService.createFromSnapshot(
            app,
            createFile('Note.md', ''),
            'content',
            ts
        )

        expect(created).toBeNull()
        expect(create).toHaveBeenCalledTimes(1)
    })
})
