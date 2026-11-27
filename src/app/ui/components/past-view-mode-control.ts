import { setIcon } from 'obsidian'

export function renderPastViewModeControl(
    parent: HTMLElement,
    showDiff: boolean,
    onChange: (showDiff: boolean) => void
): void {
    const group = parent.createDiv({ cls: 'tm-past-view-modes' })

    const addButton = (target: boolean, text: string, iconName: string): void => {
        const active = showDiff === target
        const btn = group.createEl('button', {
            cls: 'tm-past-diff-toggle' + (active ? ' is-active' : ''),
            text,
            attr: { 'aria-pressed': String(active) }
        })
        const icon = btn.createSpan({ cls: 'tm-past-diff-toggle-icon' })
        setIcon(icon, iconName)
        btn.prepend(icon)
        btn.addEventListener('click', () => {
            if (!active) onChange(target)
        })
    }

    addButton(true, showDiff ? 'Showing changes' : 'Show changes', 'git-compare')
    addButton(false, 'Visualize version', 'file-text')
}
