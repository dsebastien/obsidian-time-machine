import { App, Modal } from 'obsidian'

/**
 * Confirmation dialog shared by every surface that performs a destructive
 * action. Extracted from `TimeMachineView` so additional views can reuse it
 * rather than each declaring a file-private copy.
 */
export class ConfirmModal extends Modal {
    private readonly titleText: string
    private readonly message: string
    private readonly confirmLabel: string
    private readonly callback: (result: boolean) => void
    private settled = false

    constructor(
        app: App,
        title: string,
        message: string,
        callback: (result: boolean) => void,
        confirmLabel = 'Restore'
    ) {
        super(app)
        this.titleText = title
        this.message = message
        this.confirmLabel = confirmLabel
        this.callback = callback
    }

    /** Resolves exactly once, so dismissing via Escape cannot double-settle. */
    private settle(result: boolean): void {
        if (this.settled) return
        this.settled = true
        this.callback(result)
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()

        contentEl.createEl('h3', { text: this.titleText })
        contentEl.createEl('p', { text: this.message })

        const buttonContainer = contentEl.createDiv({ cls: 'tm-confirm-buttons' })

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' })
        cancelBtn.addEventListener('click', () => {
            this.settle(false)
            this.close()
        })

        const confirmBtn = buttonContainer.createEl('button', {
            cls: 'mod-warning',
            text: this.confirmLabel
        })
        confirmBtn.addEventListener('click', () => {
            this.settle(true)
            this.close()
        })
    }

    override onClose(): void {
        // Dismissing without choosing (Escape, click-outside) counts as cancel.
        this.settle(false)
        this.contentEl.empty()
    }
}

/** Promise wrapper around {@link ConfirmModal}. */
export function showConfirmDialog(
    app: App,
    title: string,
    message: string,
    confirmLabel?: string
): Promise<boolean> {
    return new Promise((resolve) => {
        new ConfirmModal(app, title, message, resolve, confirmLabel).open()
    })
}
