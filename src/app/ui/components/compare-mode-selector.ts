import type { CompareMode } from '../../types/diff.intf'

export interface CompareModeSelectorCallbacks {
    onChange: (mode: CompareMode) => void
}

export class CompareModeSelectorComponent {
    private readonly container: HTMLElement

    constructor(parent: HTMLElement, callbacks: CompareModeSelectorCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-compare-mode' })

        const label = this.container.createEl('label', {
            cls: 'tm-compare-mode-label',
            text: 'Compare mode'
        })

        const select = this.container.createEl('select', {
            cls: 'tm-compare-mode-select dropdown'
        })
        label.htmlFor = select.id = 'tm-compare-mode-select'

        const optCurrent = select.createEl('option', {
            text: 'Current vs version',
            value: 'current-vs-version'
        })
        optCurrent.value = 'current-vs-version'

        const optVersion = select.createEl('option', {
            text: 'Version vs version',
            value: 'version-vs-version'
        })
        optVersion.value = 'version-vs-version'

        select.addEventListener('change', () => {
            callbacks.onChange(select.value as CompareMode)
        })
    }

    getContainer(): HTMLElement {
        return this.container
    }
}
