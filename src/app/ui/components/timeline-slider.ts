import { setIcon } from 'obsidian'
import type { GitMetadata, Snapshot } from '../../types/snapshot.intf'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'
import { formatSnapshotLabel } from '../../domain/snapshot'

export interface TimelineSliderCallbacks {
    onSelect: (snapshot: Snapshot, index: number) => void
}

export class TimelineSliderComponent {
    private readonly container: HTMLElement
    private readonly callbacks: TimelineSliderCallbacks
    private selectedDateEl: HTMLElement | null = null
    private selectedRelativeEl: HTMLElement | null = null
    private sourceIndicatorEl: HTMLElement | null = null
    private snapshots: Snapshot[] = []

    constructor(parent: HTMLElement, callbacks: TimelineSliderCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-timeline-slider' })
        this.callbacks = callbacks
    }

    render(snapshots: Snapshot[]): void {
        this.container.empty()
        this.snapshots = snapshots

        if (snapshots.length === 0) {
            return
        }

        // Only show slider when there are multiple snapshots
        if (snapshots.length > 1) {
            const max = snapshots.length - 1

            // Slider wrapper for the filled track effect
            const sliderWrap = this.container.createDiv({ cls: 'tm-timeline-slider-wrap' })

            // Range input
            const slider = sliderWrap.createEl('input', {
                cls: 'tm-timeline-slider-input',
                type: 'range'
            })
            slider.min = '0'
            slider.max = String(max)
            slider.step = '1'
            slider.value = '0' // Start at newest (left end)

            // Set initial fill
            this.updateTrackFill(slider, 0, max)

            // Edge labels row (newest left, oldest right)
            const edgeLabels = this.container.createDiv({ cls: 'tm-timeline-slider-edges' })
            const newest = snapshots[0]
            const oldest = snapshots[max]
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

            slider.addEventListener('input', () => {
                const sliderValue = parseInt(slider.value, 10)
                this.updateTrackFill(slider, sliderValue, max)
                this.updateSelectedDisplay(sliderValue)
                const snapshot = this.snapshots[sliderValue]
                if (snapshot) {
                    this.callbacks.onSelect(snapshot, sliderValue)
                }
            })
        }

        // Selected date display (shown for both single and multiple snapshots)
        const selectedInfo = this.container.createDiv({ cls: 'tm-timeline-slider-selected' })
        this.selectedDateEl = selectedInfo.createSpan({ cls: 'tm-timeline-slider-selected-date' })
        selectedInfo.createSpan({
            cls: 'tm-timeline-slider-selected-sep',
            text: '\u00B7'
        })
        this.selectedRelativeEl = selectedInfo.createSpan({
            cls: 'tm-timeline-slider-selected-relative'
        })

        // Source indicator (icon + label below the date)
        this.sourceIndicatorEl = this.container.createDiv({
            cls: 'tm-timeline-slider-selected-source'
        })

        // Set initial display and auto-select newest
        this.updateSelectedDisplay(0)
        const newestSnapshot = this.snapshots[0]
        if (newestSnapshot) {
            this.callbacks.onSelect(newestSnapshot, 0)
        }
    }

    private updateTrackFill(slider: HTMLInputElement, value: number, max: number): void {
        const percent = max > 0 ? (value / max) * 100 : 0
        slider.style.setProperty('--slider-progress', `${percent}%`)
    }

    private updateSelectedDisplay(sliderValue: number): void {
        const snapshot = this.snapshots[sliderValue]
        if (!snapshot) return

        if (this.selectedDateEl) {
            this.selectedDateEl.textContent = formatBackupDate(snapshot.ts)
        }
        if (this.selectedRelativeEl) {
            this.selectedRelativeEl.textContent = formatRelativeTime(snapshot.ts)
        }
        if (this.sourceIndicatorEl) {
            this.renderSourceIndicator(this.sourceIndicatorEl, snapshot)
        }
    }

    private renderSourceIndicator(container: HTMLElement, snapshot: Snapshot): void {
        container.empty()

        const iconEl = container.createSpan({ cls: 'tm-timeline-slider-source-icon' })

        if (snapshot.source === 'git') {
            setIcon(iconEl, 'git-branch')
            const meta = snapshot.metadata as GitMetadata
            container.createSpan({
                cls: 'tm-timeline-slider-source-label',
                text: formatSnapshotLabel(snapshot)
            })
            container.createSpan({
                cls: 'tm-timeline-slider-source-author',
                text: meta.authorName
            })
        } else {
            setIcon(iconEl, 'clock')
            container.createSpan({
                cls: 'tm-timeline-slider-source-label',
                text: 'File recovery'
            })
        }
    }
}
