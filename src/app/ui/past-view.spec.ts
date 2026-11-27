import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { MarkdownRenderer, TFile, type Component, type WorkspaceLeaf } from 'obsidian'
import { createRecording, createRecordingEl } from '../../../test/dom'
import { SnapshotCache } from '../services/snapshot-cache'
import { SnapshotService } from '../services/snapshot.service'
import { DEFAULT_SETTINGS } from '../types/plugin-settings.intf'
import type { TimeMachinePlugin } from '../plugin'
import { PastView } from './past-view'

afterEach(() => {
    mock.restore()
})

test('shows the selected version without creating or changing a note', async () => {
    const rec = createRecording()
    const root = createRecordingEl(rec)
    const create = mock(async () => {})
    const modify = mock(async () => {})
    const file = Object.assign(new TFile(), { path: 'note.md', name: 'note.md' })
    const snapshots = [
        {
            id: 'fr-2',
            path: file.path,
            ts: 2,
            data: 'newer version',
            source: 'file-recovery' as const,
            metadata: { source: 'file-recovery' as const }
        },
        {
            id: 'fr-1',
            path: file.path,
            ts: 1,
            data: 'older version',
            source: 'file-recovery' as const,
            metadata: { source: 'file-recovery' as const }
        }
    ]
    spyOn(SnapshotService, 'getSnapshots').mockResolvedValue(snapshots)
    const render = spyOn(MarkdownRenderer, 'render').mockResolvedValue()
    const plugin = Object.assign({} as TimeMachinePlugin, {
        settings: { ...DEFAULT_SETTINGS },
        snapshotCache: new SnapshotCache()
    })
    const leaf = { getViewState: () => ({}) } as WorkspaceLeaf
    const view = new PastView(leaf, plugin)
    Object.assign(view, {
        leaf,
        containerEl: { children: [null, root] },
        app: {
            vault: { read: mock(() => Promise.resolve('current content')), create, modify },
            workspace: { requestSaveLayout: mock(() => {}) }
        },
        addChild: (child: Component) => child,
        removeChild: (child: Component) => child
    })

    await view.onOpen()
    await view.updateForFile(file)
    rec.clicksByClass.get('tm-past-diff-toggle')?.()
    rec.keysByClass.get('tm-rail')?.({ key: 'End', preventDefault: () => {} })
    rec.clicksByClass.get('tm-past-diff-toggle')?.()

    expect(view.getState()['snapshotId']).toBe('fr-1')
    expect(view.getState()['showDiff']).toBe(false)
    expect(render).toHaveBeenLastCalledWith(
        view.app,
        'older version',
        expect.anything(),
        file.path,
        expect.anything()
    )
    expect(create).not.toHaveBeenCalled()
    expect(modify).not.toHaveBeenCalled()
})
