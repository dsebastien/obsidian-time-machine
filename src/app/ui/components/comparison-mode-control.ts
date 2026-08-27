import type { DiffComparisonMode } from '../../types/plugin-settings.intf'

/**
 * "Compare with: Current file / Next version" segmented toggle.
 *
 * Extracted from `DiffViewerComponent` so a view can own the control in its
 * header while the diff viewer renders only the diff body. Rendering it in both
 * places would show the user two competing copies of the same setting.
 */
export function renderComparisonModeControl(
    parent: HTMLElement,
    mode: DiffComparisonMode,
    onChange: (mode: DiffComparisonMode) => void
): HTMLElement {
    const wrap = parent.createDiv({ cls: 'tm-compare-mode' })
    wrap.createSpan({ cls: 'tm-compare-mode-label', text: 'Compare with' })
    const group = wrap.createDiv({ cls: 'tm-compare-mode-group' })

    const addModeButton = (target: DiffComparisonMode, text: string, tooltip: string): void => {
        const btn = group.createEl('button', {
            cls: 'tm-compare-mode-btn' + (mode === target ? ' is-active' : ''),
            text,
            attr: { 'aria-label': tooltip, 'aria-pressed': String(mode === target) }
        })
        btn.addEventListener('click', () => {
            if (target !== mode) onChange(target)
        })
    }

    addModeButton(
        'current',
        'Current file',
        'Everything that changed between the selected version and the file as it is now'
    )
    addModeButton(
        'next',
        'Next version',
        'Only what changed between the selected version and the next newer one'
    )

    return wrap
}
