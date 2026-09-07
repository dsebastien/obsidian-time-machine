import type { Snapshot } from '../types/snapshot.intf'
import { structuredPatch } from 'diff'
import { deduplicateSnapshots } from './snapshot'
import { stripFrozenHistory } from './frozen-history'

export interface HistoryExportOptions {
    format: 'diffs' | 'full'
    maxVersions: number | null
}

export interface HistoryExport {
    markdown: string
    versionCount: number
    availableCount: number
    bytes: number
}

export const MAX_HISTORY_BYTES = 10 * 1024 * 1024

export function parseHistoryOptions(format: string, limit: string): HistoryExportOptions {
    if (format !== 'diffs' && format !== 'full')
        throw new Error('Choose a supported history format.')
    const value = limit.trim()
    if (value.toLowerCase() === 'all') return { format, maxVersions: null }
    const maxVersions = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(maxVersions) || maxVersions < 1) {
        throw new Error('Enter a positive whole number or "all" for the version limit.')
    }
    return { format, maxVersions }
}

function escapeText(value: string): string {
    return value
        .replace(/[\r\n\u2028\u2029]/g, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/[\\`*_[\]{}()#!|]/g, '\\$&')
}

function fenced(content: string, language: 'diff' | 'text'): string {
    let length = 3
    for (const match of content.matchAll(/`+/g)) {
        length = Math.max(length, match[0].length + 1)
    }
    const fence = '`'.repeat(length)
    return `${fence}${language}\n${content}${content.endsWith('\n') ? '' : '\n'}${fence}`
}

function diffText(older: string, newer: string): string {
    const patch = structuredPatch('older', 'version', older, newer, '', '', {
        context: 3,
        timeout: 1000
    })
    if (!patch) {
        throw new Error('This diff is too complex to export. Choose full versions instead.')
    }
    return patch.hunks
        .map((hunk) =>
            [
                `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
                ...hunk.lines
            ].join('\n')
        )
        .join('\n')
}

function renderVersion(
    snapshot: Snapshot,
    older: Snapshot | undefined,
    format: HistoryExportOptions['format']
): string {
    const metadata = snapshot.metadata
    const lines = [
        `### ${new Date(snapshot.ts).toISOString()}`,
        '',
        `- Source: ${metadata.source === 'git' ? 'Git' : 'File Recovery'}`,
        `- Author: ${metadata.source === 'git' ? escapeText(metadata.authorName) : 'Not recorded by File Recovery'}`
    ]
    if (metadata.source === 'git') {
        lines.push(
            `- Commit: ${escapeText(metadata.commitHash)}`,
            `- Message: ${escapeText(metadata.commitMessage)}`
        )
    }
    lines.push('')
    if (format === 'full') {
        lines.push(fenced(snapshot.data, 'text'))
    } else {
        lines.push(
            older
                ? `Changes from ${new Date(older.ts).toISOString()} to this version.`
                : 'Baseline: oldest included version, compared with an empty note.',
            '',
            fenced(diffText(older?.data ?? '', snapshot.data), 'diff')
        )
    }
    return lines.join('\n')
}

export function renderHistory(
    path: string,
    snapshots: Snapshot[],
    options: HistoryExportOptions
): HistoryExport {
    const { maxVersions, format } = options
    if (maxVersions !== null && (!Number.isSafeInteger(maxVersions) || maxVersions < 1)) {
        throw new Error('The version limit must be a positive whole number, or all.')
    }
    const cleaned = snapshots.map((snapshot) => {
        if (snapshot.path !== path) throw new Error('Cannot export snapshots from another note.')
        return { ...snapshot, data: stripFrozenHistory(snapshot.data).replace(/\r\n/g, '\n') }
    })
    cleaned.sort((a, b) => b.ts - a.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const unique = deduplicateSnapshots(cleaned)
    const selected = unique.slice(0, maxVersions ?? unique.length)
    if (selected.length === 0) throw new Error('No recorded versions are available for this note.')
    const parts = [
        '## Version history',
        '',
        `Note: ${escapeText(path)}`,
        '',
        `${selected.length} of ${unique.length} available unique versions, newest first. Format: ${format === 'diffs' ? 'diffs' : 'full versions'}.`,
        '',
        'Only retained snapshots from enabled, available sources are included, within the configured Git commit limit. This is not a complete edit log or cryptographic proof of authorship.',
        'Previously frozen history is excluded. Line endings are normalized to LF.',
        ''
    ]
    const encoder = new TextEncoder()
    let bytes = encoder.encode(parts.join('\n')).length
    for (let index = 0; index < selected.length; index++) {
        const snapshot = selected[index]
        if (!snapshot) continue
        if (snapshot.data.length > MAX_HISTORY_BYTES) {
            throw new Error('History exceeds the 10 MiB safety limit. Select fewer versions.')
        }
        const entry = renderVersion(snapshot, selected[index + 1], format)
        bytes += encoder.encode(entry).length + 2
        if (bytes > MAX_HISTORY_BYTES) {
            throw new Error('History exceeds the 10 MiB safety limit. Select fewer versions.')
        }
        parts.push(entry, '')
    }
    const markdown = parts.join('\n')
    return {
        markdown,
        versionCount: selected.length,
        availableCount: unique.length,
        bytes: encoder.encode(markdown).length
    }
}
