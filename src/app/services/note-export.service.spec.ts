import { describe, expect, test, mock } from 'bun:test'
import { TFile, TFolder, type App } from 'obsidian'
import { NoteExportService } from './note-export.service'

function createFile(path: string, parentPath: string | null): TFile {
    const name = path.split('/').pop() ?? path
    const extension = name.endsWith('.canvas') ? 'canvas' : 'md'
    const basename = name.replace(/\.(?:canvas|md)$/, '')
    return Object.assign(new TFile(), {
        path,
        basename,
        name,
        extension,
        parent: parentPath === null ? null : Object.assign(new TFolder(), { path: parentPath })
    })
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

    test('writes Canvas snapshots to a timestamped sibling Canvas file', async () => {
        const paths: string[] = []
        const canvasContent = '{"nodes":[],"edges":[]}'
        let attempts = 0
        const app = createApp((path, data) => {
            paths.push(path)
            expect(data).toBe(canvasContent)
            attempts++
            if (attempts === 1) return Promise.reject(new Error('File already exists.'))
            return Promise.resolve({ name: path })
        })

        const created = await NoteExportService.createFromSnapshot(
            app,
            createFile('boards/Board.canvas', 'boards'),
            canvasContent,
            ts
        )

        expect(paths).toHaveLength(2)
        expect(paths[0]).toMatch(/^boards\/Board \(2026-08-27 \d\d-\d\d\)\.canvas$/)
        expect(paths[1]).toMatch(/^boards\/Board \(2026-08-27 \d\d-\d\d\) 2\.canvas$/)
        expect(created?.name).toBe(paths[1])
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
