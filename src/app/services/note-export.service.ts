import type { App, TFile } from 'obsidian'
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

/**
 * Writes a historical version out as a new note beside the original.
 *
 * This is the only place the plugin creates a file. Everything else is
 * read-only or writes back to the note the user already had.
 */
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
        const folder = sourceFile.parent?.path ?? ''
        // A file at the vault root has parent path '/', which must not become a
        // leading double slash.
        const prefix = folder === '' || folder === '/' ? '' : `${folder}/`
        const base = `${prefix}${sourceFile.basename} (${stamp})`

        for (let attempt = 0; attempt < 20; attempt++) {
            const path = attempt === 0 ? `${base}.md` : `${base} ${String(attempt + 1)}.md`
            try {
                const created = await app.vault.create(path, content)
                new Notice(`Time Machine: Created "${created.name}"`)
                log('Created note from snapshot', 'info', created.path)
                return created
            } catch (error) {
                // Only a name collision is worth retrying. A permission error or
                // an invalid path would fail identically twenty times over and
                // bury the real reason.
                if (!isAlreadyExistsError(error)) {
                    log('Could not create note from snapshot', 'error', { path, error })
                    new Notice(`Time Machine: Could not create the note — ${describeError(error)}`)
                    return null
                }
                log('Name taken, trying the next suffix', 'debug', path)
            }
        }

        new Notice('Time Machine: Could not find a free file name for this version')
        return null
    }
}
