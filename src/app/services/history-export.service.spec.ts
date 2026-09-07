import { describe, expect, test } from 'bun:test'
import { TFile } from 'obsidian'
import type { Vault } from 'obsidian'
import { renderHistory } from '../domain/history-export'
import { stripFrozenHistory } from '../domain/frozen-history'
import { fileRecoveryToSnapshot } from '../domain/snapshot'
import {
    exportHistory,
    freezeHistory,
    writeNoteHistory,
    type PreparedHistory
} from './history-export.service'

async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
    let caught: unknown
    await promise.catch((error: unknown) => {
        caught = error
    })
    expect(caught).toBeInstanceOf(Error)
    if (caught instanceof Error) expect(caught.message).toContain(message)
}

function fixture(path = 'notes/Note.md') {
    const file = Object.assign(new TFile(), {
        path,
        basename: 'Note',
        name: 'Note.md',
        extension: 'md'
    })
    let content = '# Current\n'
    let writes = 0
    const files = new Map<string, string>()
    const vault = {
        read: () => Promise.resolve(content),
        process: (_file: TFile, fn: (data: string) => string) => {
            content = fn(content)
            writes++
            return Promise.resolve(content)
        },
        create: (newPath: string, data: string) => {
            if (files.has(newPath)) return Promise.reject(new Error('File already exists.'))
            files.set(newPath, data)
            return Promise.resolve(Object.assign(new TFile(), { path: newPath, name: newPath }))
        }
    } satisfies Pick<Vault, 'read' | 'process' | 'create'>
    const prepared: PreparedHistory = {
        ...renderHistory(path, [fileRecoveryToSnapshot({ path, ts: 1000, data: 'old' })], {
            format: 'full',
            maxVersions: null
        }),
        path,
        sourceContent: content
    }
    return {
        file,
        vault,
        prepared,
        files,
        content: () => content,
        writes: () => writes,
        edit: (data: string) => {
            content = data
        }
    }
}

describe('history export writes', () => {
    test('creates a collision-safe sibling and leaves the source unchanged', async () => {
        const f = fixture()
        f.files.set('notes/Note (history).md', 'existing')
        const result = await exportHistory(f.vault, f.file, f.prepared)
        expect(result.path).toBe('notes/Note (history) 2.md')
        expect(f.files.get(result.path)).toBe(f.prepared.markdown)
        expect(f.files.get('notes/Note (history).md')).toBe('existing')
        expect(f.content()).toBe(f.prepared.sourceContent)
        expect(f.writes()).toBe(0)
    })

    test('handles root notes and propagates non-collision failures without retrying', async () => {
        const f = fixture('Note.md')
        expect((await exportHistory(f.vault, f.file, f.prepared)).path).toBe('Note (history).md')
        let attempts = 0
        const vault = {
            create: () => {
                attempts++
                return Promise.reject(new Error('EACCES'))
            }
        }
        await expectRejection(exportHistory(vault, f.file, f.prepared), 'EACCES')
        expect(attempts).toBe(1)
    })

    test('bounds collision retries and refuses a renamed source', async () => {
        const f = fixture()
        let attempts = 0
        const vault = {
            create: () => {
                attempts++
                return Promise.reject(new Error('already exists'))
            }
        }
        await expectRejection(exportHistory(vault, f.file, f.prepared), '20 attempts')
        expect(attempts).toBe(20)
        f.file.path = 'Renamed.md'
        await expectRejection(exportHistory(f.vault, f.file, f.prepared), 'renamed')
        expect(f.files.size).toBe(0)
    })

    test('freezes atomically and preserves content outside its section on repeated writes', async () => {
        const f = fixture()
        expect(await freezeHistory(f.vault, f.file, f.prepared, () => false)).toBe(true)
        const first = f.content()
        expect(stripFrozenHistory(first)).toBe(f.prepared.sourceContent)
        const prepared = { ...f.prepared, sourceContent: first }
        expect(await freezeHistory(f.vault, f.file, prepared, () => false)).toBe(false)
        expect(f.content()).toBe(first)
        expect(f.writes()).toBe(1)
    })

    test('refuses edits made while preparing or confirming', async () => {
        const f = fixture()
        f.edit('new user edit')
        await expectRejection(
            freezeHistory(f.vault, f.file, f.prepared, () => false),
            'changed'
        )
        expect(f.content()).toBe('new user edit')
        expect(f.writes()).toBe(0)
    })

    test('checks cancellation again inside the atomic callback', async () => {
        const f = fixture()
        let cancelled = false
        const vault = {
            ...f.vault,
            process: (file: TFile, fn: (data: string) => string) => {
                cancelled = true
                return f.vault.process(file, fn)
            }
        }
        await expectRejection(
            freezeHistory(vault, f.file, f.prepared, () => cancelled),
            'cancelled'
        )
        expect(f.writes()).toBe(0)
    })

    test('propagates write failures and refuses malformed source markers', async () => {
        const f = fixture()
        const vault = { ...f.vault, process: () => Promise.reject(new Error('disk full')) }
        await expectRejection(
            freezeHistory(vault, f.file, f.prepared, () => false),
            'disk full'
        )
        const prepared = { ...f.prepared, sourceContent: '<!-- time-machine:history:start -->' }
        await expectRejection(
            freezeHistory(f.vault, f.file, prepared, () => false),
            'history markers'
        )
        expect(f.writes()).toBe(0)
    })

    test('cancelled confirmation, fetch rejection and dismissal never write', async () => {
        const f = fixture()
        let cancelled = false
        const host = {
            vault: f.vault,
            fetchSnapshots: () =>
                Promise.resolve([
                    fileRecoveryToSnapshot({ path: f.file.path, ts: 1000, data: 'old' })
                ]),
            confirm: () => Promise.resolve(false),
            cancelled: () => cancelled
        }
        const options = { format: 'diffs', maxVersions: null } as const
        expect(await writeNoteHistory(host, f.file, 'freeze', options)).toBeNull()
        host.fetchSnapshots = () => Promise.reject(new Error('fetch failed'))
        await expectRejection(writeNoteHistory(host, f.file, 'export', options), 'fetch failed')
        cancelled = true
        expect(await writeNoteHistory(host, f.file, 'export', options)).toBeNull()
        expect(f.writes()).toBe(0)
        expect(f.files.size).toBe(0)
    })

    test('captures source before the fetch and confirms the exact rendered output', async () => {
        const f = fixture()
        const host = {
            vault: f.vault,
            fetchSnapshots: (path: string) => {
                f.edit('edited during fetch')
                return Promise.resolve([fileRecoveryToSnapshot({ path, ts: 1000, data: 'old' })])
            },
            confirm: (prepared: PreparedHistory) => {
                expect(prepared.versionCount).toBe(1)
                expect(prepared.markdown).toContain('old')
                expect(prepared.sourceContent).toBe('# Current\n')
                return Promise.resolve(true)
            },
            cancelled: () => false
        }
        await expectRejection(
            writeNoteHistory(host, f.file, 'freeze', { format: 'full', maxVersions: 20 }),
            'changed'
        )
        expect(f.content()).toBe('edited during fetch')
    })

    test.each(['cancel', 'rename'])('stops export retries after %s', async (action) => {
        const f = fixture()
        let cancelled = false
        let attempts = 0
        const host = {
            vault: {
                ...f.vault,
                create: () => {
                    attempts++
                    if (action === 'cancel') cancelled = true
                    else f.file.path = 'Renamed.md'
                    return Promise.reject(new Error('already exists'))
                }
            },
            fetchSnapshots: (path: string) =>
                Promise.resolve([fileRecoveryToSnapshot({ path, ts: 1, data: 'old' })]),
            confirm: () => Promise.resolve(true),
            cancelled: () => cancelled
        }
        await expectRejection(
            writeNoteHistory(host, f.file, 'export', { format: 'full', maxVersions: null }),
            action === 'cancel' ? 'cancelled' : 'renamed'
        )
        expect(attempts).toBe(1)
    })
})
