import { setIcon } from 'obsidian'

/**
 * "Restore entire version" action. Shared by every history surface so the
 * label, icon and class names stay identical across them.
 */
export function renderRestoreFullButton(parent: HTMLElement, onClick: () => void): HTMLElement {
    const restoreBtn = parent.createEl('button', {
        cls: 'tm-restore-full-btn',
        text: 'Restore entire version'
    })
    const iconSpan = restoreBtn.createSpan({ cls: 'tm-restore-btn-icon' })
    setIcon(iconSpan, 'rotate-ccw')
    restoreBtn.prepend(iconSpan)

    restoreBtn.addEventListener('click', onClick)
    return restoreBtn
}
