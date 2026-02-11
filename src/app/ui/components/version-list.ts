import type { FileRecoveryBackup } from '../../types/backup.intf'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'
import type { CompareMode } from '../../types/diff.intf'

export interface VersionListCallbacks {
    onSelect: (backup: FileRecoveryBackup, index: number) => void
}

export class VersionListComponent {
    private readonly container: HTMLElement
    private readonly callbacks: VersionListCallbacks
    private selectedIndices: Set<number> = new Set()
    private compareMode: CompareMode = 'current-vs-version'
    private itemElements: HTMLElement[] = []

    constructor(parent: HTMLElement, callbacks: VersionListCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-version-list' })
        this.callbacks = callbacks
    }

    render(backups: FileRecoveryBackup[]): void {
        this.container.empty()
        this.itemElements = []

        if (backups.length === 0) {
            return
        }

        for (let i = 0; i < backups.length; i++) {
            const backup = backups[i]
            if (!backup) continue

            const item = this.container.createDiv({ cls: 'tm-version-item' })
            this.itemElements.push(item)

            item.createDiv({
                cls: 'tm-version-date',
                text: formatBackupDate(backup.ts)
            })
            item.createDiv({
                cls: 'tm-version-relative',
                text: formatRelativeTime(backup.ts)
            })

            const idx = i
            item.addEventListener('click', () => {
                this.handleClick(idx)
                this.callbacks.onSelect(backups[idx]!, idx)
            })
        }
    }

    setCompareMode(mode: CompareMode): void {
        this.compareMode = mode
        this.clearSelection()
    }

    clearSelection(): void {
        this.selectedIndices.clear()
        this.updateSelectionVisuals()
    }

    getSelectedIndices(): number[] {
        return [...this.selectedIndices]
    }

    private handleClick(index: number): void {
        if (this.compareMode === 'current-vs-version') {
            this.selectedIndices.clear()
            this.selectedIndices.add(index)
        } else {
            // version-vs-version: allow selecting up to 2
            if (this.selectedIndices.has(index)) {
                this.selectedIndices.delete(index)
            } else if (this.selectedIndices.size < 2) {
                this.selectedIndices.add(index)
            } else {
                // Replace the oldest selection
                const first = this.selectedIndices.values().next().value as number
                this.selectedIndices.delete(first)
                this.selectedIndices.add(index)
            }
        }
        this.updateSelectionVisuals()
    }

    private updateSelectionVisuals(): void {
        for (let i = 0; i < this.itemElements.length; i++) {
            const el = this.itemElements[i]
            if (el) {
                el.toggleClass('tm-version-item--selected', this.selectedIndices.has(i))
            }
        }
    }
}
