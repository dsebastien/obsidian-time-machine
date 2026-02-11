import type { FileRecoveryBackup } from '../../types/backup.intf'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'

export interface TimelineSliderCallbacks {
    onSelect: (backup: FileRecoveryBackup, index: number) => void
}

export class TimelineSliderComponent {
    private readonly container: HTMLElement
    private readonly callbacks: TimelineSliderCallbacks
    private selectedDateEl: HTMLElement | null = null
    private selectedRelativeEl: HTMLElement | null = null
    private backups: FileRecoveryBackup[] = []

    constructor(parent: HTMLElement, callbacks: TimelineSliderCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-timeline-slider' })
        this.callbacks = callbacks
    }

    render(backups: FileRecoveryBackup[]): void {
        this.container.empty()
        this.backups = backups

        if (backups.length === 0) {
            return
        }

        const max = backups.length - 1

        // Range input
        const slider = this.container.createEl('input', {
            cls: 'tm-timeline-slider-input',
            type: 'range'
        })
        slider.min = '0'
        slider.max = String(max)
        slider.step = '1'
        slider.value = '0' // Start at newest (left end)

        // Edge labels row (newest left, oldest right)
        const edgeLabels = this.container.createDiv({ cls: 'tm-timeline-slider-edges' })
        const newest = backups[0]
        const oldest = backups[max]
        if (newest) {
            edgeLabels.createDiv({
                cls: 'tm-timeline-slider-edge-label',
                text: formatBackupDate(newest.ts)
            })
        }
        if (oldest) {
            edgeLabels.createDiv({
                cls: 'tm-timeline-slider-edge-label',
                text: formatBackupDate(oldest.ts)
            })
        }

        // Selected date display
        const selectedInfo = this.container.createDiv({ cls: 'tm-timeline-slider-selected' })
        this.selectedDateEl = selectedInfo.createDiv({ cls: 'tm-timeline-slider-selected-date' })
        this.selectedRelativeEl = selectedInfo.createDiv({
            cls: 'tm-timeline-slider-selected-relative'
        })

        // Set initial display to newest
        this.updateSelectedDisplay(0)

        slider.addEventListener('input', () => {
            const sliderValue = parseInt(slider.value, 10)
            this.updateSelectedDisplay(sliderValue)
            const backup = this.backups[sliderValue]
            if (backup) {
                this.callbacks.onSelect(backup, sliderValue)
            }
        })

        // Auto-select newest on initial render
        const newestBackup = this.backups[0]
        if (newestBackup) {
            this.callbacks.onSelect(newestBackup, 0)
        }
    }

    private updateSelectedDisplay(sliderValue: number): void {
        const backup = this.backups[sliderValue]
        if (!backup) return

        if (this.selectedDateEl) {
            this.selectedDateEl.textContent = formatBackupDate(backup.ts)
        }
        if (this.selectedRelativeEl) {
            this.selectedRelativeEl.textContent = formatRelativeTime(backup.ts)
        }
    }
}
