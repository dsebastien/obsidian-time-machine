import type { TFile, Vault } from 'obsidian'
import type { HistoryExport } from '../domain/history-export'
import {
    MAX_HISTORY_BYTES,
    renderHistory,
    type HistoryExportOptions
} from '../domain/history-export'
import { replaceFrozenHistory } from '../domain/frozen-history'
import type { Snapshot } from '../types/snapshot.intf'
import { createSiblingNote } from './note-export.service'

export interface PreparedHistory extends HistoryExport {
    path: string
    sourceContent: string
}

export async function exportHistory(
    vault: Pick<Vault, 'create'>,
    file: TFile,
    prepared: PreparedHistory,
    cancelled: () => boolean = () => false
): Promise<TFile> {
    return createSiblingNote(vault, file, 'history', prepared.markdown, () => {
        if (cancelled()) throw new Error('History operation cancelled.')
        assertPath(file, prepared.path)
    })
}

export async function freezeHistory(
    vault: Pick<Vault, 'read' | 'process'>,
    file: TFile,
    prepared: PreparedHistory,
    cancelled: () => boolean
): Promise<boolean> {
    const next = replaceFrozenHistory(prepared.sourceContent, prepared.markdown)
    if (new TextEncoder().encode(next).length > MAX_HISTORY_BYTES) {
        throw new Error(
            'The resulting note exceeds the 10 MiB safety limit. Select fewer versions.'
        )
    }
    const guard = (current: string): void => {
        if (cancelled()) throw new Error('History operation cancelled.')
        assertPath(file, prepared.path)
        if (current !== prepared.sourceContent) {
            throw new Error('The note changed while preparing history. Run the command again.')
        }
    }
    guard(prepared.sourceContent)
    if (next === prepared.sourceContent) {
        guard(await vault.read(file))
        return false
    }
    await vault.process(file, (current) => {
        guard(current)
        return next
    })
    return true
}

function assertPath(file: TFile, path: string): void {
    if (file.path !== path) throw new Error('The note was renamed. Run the command again.')
}

export interface HistoryExportHost {
    vault: Pick<Vault, 'read' | 'create' | 'process'>
    fetchSnapshots: (path: string) => Promise<Snapshot[]>
    confirm: (prepared: PreparedHistory) => Promise<boolean>
    cancelled: () => boolean
}

export type HistoryWriteResult =
    | { kind: 'exported'; file: TFile }
    | { kind: 'frozen' | 'unchanged' }
    | null

/** The target is captured before fetching; focus changes cannot redirect a write. */
export async function writeNoteHistory(
    host: HistoryExportHost,
    file: TFile,
    target: 'export' | 'freeze',
    options: HistoryExportOptions
): Promise<HistoryWriteResult> {
    const path = file.path
    const sourceContent = await host.vault.read(file)
    if (host.cancelled()) return null
    const snapshots = await host.fetchSnapshots(path)
    if (host.cancelled()) return null
    assertPath(file, path)
    const prepared = { ...renderHistory(path, snapshots, options), path, sourceContent }
    if (target === 'freeze') {
        // Validate markers before asking for permission to write.
        replaceFrozenHistory(sourceContent, prepared.markdown)
        if (!(await host.confirm(prepared)) || host.cancelled()) return null
        const changed = await freezeHistory(host.vault, file, prepared, host.cancelled)
        return { kind: changed ? 'frozen' : 'unchanged' }
    }
    if (host.cancelled()) return null
    return {
        kind: 'exported',
        file: await exportHistory(host.vault, file, prepared, host.cancelled)
    }
}
