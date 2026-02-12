import { setIcon } from 'obsidian'

export type EmptyStateReason = 'no-file' | 'no-snapshots' | 'file-recovery-disabled'

export function renderEmptyState(container: HTMLElement, reason: EmptyStateReason): void {
    container.empty()
    const wrapper = container.createDiv({ cls: 'tm-empty-state' })

    const iconEl = wrapper.createDiv({ cls: 'tm-empty-state-icon' })

    switch (reason) {
        case 'no-file': {
            setIcon(iconEl, 'file-question')
            wrapper.createEl('p', {
                cls: 'tm-empty-state-text',
                text: 'Open a file to see its history'
            })
            break
        }
        case 'no-snapshots': {
            setIcon(iconEl, 'clock')
            wrapper.createEl('p', {
                cls: 'tm-empty-state-text',
                text: 'No snapshots found for this file'
            })
            wrapper.createEl('p', {
                cls: 'tm-empty-state-hint',
                text: 'Snapshots are created by File Recovery and git commits'
            })
            break
        }
        case 'file-recovery-disabled': {
            setIcon(iconEl, 'alert-triangle')
            wrapper.createEl('p', {
                cls: 'tm-empty-state-text',
                text: 'File Recovery core plugin is not enabled'
            })
            wrapper.createEl('p', {
                cls: 'tm-empty-state-hint',
                text: 'Enable it in Settings → Core plugins'
            })
            break
        }
    }
}
