import { setIcon } from 'obsidian'
import type { Snapshot } from '../../types/snapshot.intf'
import {
    computeTimelineLayout,
    findTickForSnapshot,
    stepSelection,
    type TimelineLayout
} from '../../domain/timeline-layout'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'
import { formatSnapshotLabel } from '../../domain/snapshot'

export interface TimelineBarCallbacks {
    /** Fired only for user-driven selection changes, never on render. */
    onSelect: (snapshotId: string) => void
}

/**
 * Timeline of a note's snapshots: left = newest, right = oldest.
 *
 * A **controlled** component — it renders whatever `selectedId` it is given and
 * never selects anything itself. The old slider auto-selected index 0 as a
 * render side effect, which made selection impossible to preserve across
 * re-renders; the owning session decides the selection now.
 *
 * Ticks sit proportionally to time, so a burst of saves reads as a burst.
 * Layout maths lives in `domain/timeline-layout` and is unit-tested there.
 */
export class TimelineBarComponent {
    private readonly container: HTMLElement
    private readonly callbacks: TimelineBarCallbacks

    private snapshots: Snapshot[] = []
    private selectedId: string | null = null
    private trackEl: HTMLElement | null = null

    constructor(parent: HTMLElement, callbacks: TimelineBarCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-timeline' })
        this.callbacks = callbacks
    }

    /** Current width of the track, or 0 before the element has been laid out. */
    private measure(): number {
        const width = this.trackEl?.clientWidth ?? this.container.clientWidth ?? 0
        return Number.isFinite(width) ? width : 0
    }

    render(snapshots: Snapshot[], selectedId: string | null): void {
        this.snapshots = snapshots
        this.selectedId = selectedId
        this.container.empty()

        if (snapshots.length === 0) return

        const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null

        // With a single snapshot the navigation controls are pointless, but the
        // selected-version information still renders — matching the existing
        // business rule for the slider.
        if (snapshots.length > 1) {
            this.renderTrack()
        }

        this.renderInfo(selected)
    }

    private renderTrack(): void {
        const row = this.container.createDiv({ cls: 'tm-timeline-row' })

        const newerBtn = row.createEl('button', {
            cls: 'tm-timeline-nav clickable-icon',
            attr: { 'aria-label': 'Newer version' }
        })
        setIcon(newerBtn, 'chevron-left')
        newerBtn.addEventListener('click', () => {
            this.step(-1)
        })

        const track = row.createDiv({ cls: 'tm-timeline-track' })
        track.tabIndex = 0
        track.setAttribute('role', 'slider')
        track.setAttribute('aria-label', 'Snapshot timeline')
        this.trackEl = track

        const olderBtn = row.createEl('button', {
            cls: 'tm-timeline-nav clickable-icon',
            attr: { 'aria-label': 'Older version' }
        })
        setIcon(olderBtn, 'chevron-right')
        olderBtn.addEventListener('click', () => {
            this.step(1)
        })

        track.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault()
                this.step(-1)
            } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                this.step(1)
            }
        })

        const layout = computeTimelineLayout(this.snapshots, this.measure())
        this.renderTicks(track, layout)
        this.renderEdgeLabels(layout)
    }

    private renderTicks(track: HTMLElement, layout: TimelineLayout): void {
        const selectedTick = findTickForSnapshot(layout, this.selectedId)

        track.createDiv({ cls: 'tm-timeline-line' })

        for (const tick of layout.ticks) {
            const isSelected = selectedTick !== null && tick === selectedTick
            const classes = ['tm-timeline-tick']
            if (tick.cluster) classes.push('is-cluster')
            if (isSelected) classes.push('is-selected')

            const label = tick.cluster
                ? `${String(tick.ids.length)} versions around ${formatBackupDate(tick.ts)}`
                : formatBackupDate(tick.ts)

            const tickEl = track.createDiv({
                cls: classes.join(' '),
                attr: { 'aria-label': label, 'title': label }
            })
            tickEl.style.setProperty('left', `${String(tick.position * 100)}%`)

            const icon = tickEl.createSpan({ cls: 'tm-timeline-tick-icon' })
            setIcon(icon, tick.source === 'git' ? 'git-branch' : 'clock')

            tickEl.addEventListener('click', () => {
                // A cluster selects its newest member.
                const target = tick.ids[0]
                if (target) this.callbacks.onSelect(target)
            })
        }
    }

    private renderEdgeLabels(layout: TimelineLayout): void {
        if (!layout.range || layout.tier === 'minimal') return

        const labels = this.container.createDiv({ cls: 'tm-timeline-labels' })
        labels.createSpan({ cls: 'tm-timeline-label', text: formatBackupDate(layout.range.newest) })
        labels.createSpan({ cls: 'tm-timeline-label', text: formatBackupDate(layout.range.oldest) })
    }

    private renderInfo(selected: Snapshot | null): void {
        if (!selected) return

        const info = this.container.createDiv({ cls: 'tm-timeline-info' })
        info.createSpan({ cls: 'tm-timeline-selected', text: formatBackupDate(selected.ts) })
        info.createSpan({ cls: 'tm-timeline-relative', text: formatRelativeTime(selected.ts) })

        const source = info.createSpan({ cls: 'tm-timeline-source' })
        const icon = source.createSpan({ cls: 'tm-timeline-source-icon' })
        setIcon(icon, selected.source === 'git' ? 'git-branch' : 'clock')
        source.createSpan({ text: formatSnapshotLabel(selected) })
    }

    private step(direction: -1 | 1): void {
        const next = stepSelection(this.snapshots, this.selectedId, direction)
        if (next !== null && next !== this.selectedId) {
            this.callbacks.onSelect(next)
        }
    }

    /**
     * Re-measures and re-renders. Called from the host view's `onResize`, which
     * is Obsidian's native hook — no ResizeObserver to own or disconnect.
     */
    handleResize(): void {
        if (this.snapshots.length === 0) return
        this.render(this.snapshots, this.selectedId)
    }
}
