import type { App, TFile, Vault } from 'obsidian'
import { Notice } from 'obsidian'
import { format } from 'date-fns'
import { log } from '../../utils/log'

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/** Whether a `vault.create` rejection was a name collision. */
function isAlreadyExistsError(error: unknown): boolean {
    return /already exists/i.test(describeError(error))
}

/** Creates a sibling without ever overwriting an existing file. */
export async function createSiblingNote(
    vault: Pick<Vault, 'create'>,
    source: Pick<TFile, 'path' | 'basename'>,
    suffix: string,
    content: string,
    beforeCreate?: () => void
): Promise<TFile> {
    const slash = source.path.lastIndexOf('/')
    const folder = slash < 0 ? '' : source.path.slice(0, slash + 1)
    const base = `${folder}${source.basename} (${suffix})`
    for (let attempt = 0; attempt < 20; attempt++) {
        beforeCreate?.()
        const path = attempt === 0 ? `${base}.md` : `${base} ${String(attempt + 1)}.md`
        try {
            return await vault.create(path, content)
        } catch (error) {
            if (!isAlreadyExistsError(error)) throw error
            log('Name taken, trying the next suffix', 'debug', path)
        }
    }
    throw new Error('Could not find a free file name after 20 attempts.')
}

/** Writes a historical version out as a new note beside the original. */
export class NoteExportService {
    /**
     * `<basename> (yyyy-MM-dd HH-mm).md` next to the source note.
     *
     * Collisions are handled by catching the create error and retrying with a
     * numeric suffix rather than checking existence first: `vault.create`
     * rejects when the path exists, and a pre-check races against anything else
     * writing to the vault.
     */
    static async createFromSnapshot(
        app: App,
        sourceFile: TFile,
        content: string,
        ts: number
    ): Promise<TFile | null> {
        const stamp = format(ts, 'yyyy-MM-dd HH-mm')
        try {
            const created = await createSiblingNote(app.vault, sourceFile, stamp, content)
            new Notice(`Time Machine: Created "${created.name}"`)
            log('Created note from snapshot', 'info', created.path)
            return created
        } catch (error) {
            log('Could not create note from snapshot', 'error', { path: sourceFile.path, error })
            new Notice(`Time Machine: Could not create the note — ${describeError(error)}`)
            return null
        }
    }
}
