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

/** Creates a sibling file without ever overwriting an existing file. */
export async function createSiblingFile(
    vault: Pick<Vault, 'create'>,
    source: Pick<TFile, 'path' | 'basename'>,
    suffix: string,
    content: string,
    extension: 'md' | 'canvas',
    beforeCreate?: () => void
): Promise<TFile> {
    const slash = source.path.lastIndexOf('/')
    const folder = slash < 0 ? '' : source.path.slice(0, slash + 1)
    const base = `${folder}${source.basename} (${suffix})`
    for (let attempt = 0; attempt < 20; attempt++) {
        beforeCreate?.()
        const path =
            attempt === 0 ? `${base}.${extension}` : `${base} ${String(attempt + 1)}.${extension}`
        try {
            return await vault.create(path, content)
        } catch (error) {
            if (!isAlreadyExistsError(error)) throw error
            log('Name taken, trying the next suffix', 'debug', path)
        }
    }
    throw new Error('Could not find a free file name after 20 attempts.')
}

/** Writes a historical version out as a new file beside the original. */
export class NoteExportService {
    /**
     * `<basename> (yyyy-MM-dd HH-mm).<extension>` next to the source file.
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
        const extension = sourceFile.extension === 'canvas' ? 'canvas' : 'md'
        const fileType = extension === 'canvas' ? 'canvas' : 'note'
        try {
            const created = await createSiblingFile(
                app.vault,
                sourceFile,
                stamp,
                content,
                extension
            )
            new Notice(`Time Machine: Created ${fileType} "${created.name}"`)
            log('Created file from snapshot', 'info', created.path)
            return created
        } catch (error) {
            log('Could not create file from snapshot', 'error', { path: sourceFile.path, error })
            new Notice(`Time Machine: Could not create the ${fileType} — ${describeError(error)}`)
            return null
        }
    }
}
