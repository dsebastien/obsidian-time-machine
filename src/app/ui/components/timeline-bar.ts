import { setIcon } from 'obsidian'
import type { Snapshot } from '../../types/snapshot.intf'
import {
    computeVersionRail,
    edgeSelection,
    findSegment,
    stepSelection,
    type RailGroup,
    type VersionRail
} from '../../domain/timeline-layout'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'

export interface TimelineBarCallbacks {
    /** Fired only for user-driven selection changes, never on render. */
    onSelect: (snapshotId: string) => void
}

/**
 * The version rail: every version as an equal-width segment, newest on the
 * left, grouped under time-bucket headings.
 *
 * A **controlled** component — it renders whatever `selectedId` it is given and
 * never selects anything itself, so the owning session stays the single source
 * of truth for selection.
 */
export class TimelineBarComponent {
    private readonly container: HTMLElement
    private readonly callbacks: TimelineBarCallbacks

    private snapshots: Snapshot[] = []
    private selectedId: string | null = null
    private railEl: HTMLElement | null = null
    /**
     * Whether the rail had focus when it was last replaced. Every selection
     * re-renders, destroying the focused element — without restoring focus,
     * keyboard navigation worked for exactly one keypress.
     */
    private railHadFocus = false

    constructor(parent: HTMLElement, callbacks: TimelineBarCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-rail-wrap' })
        this.callbacks = callbacks
    }

    private measure(): number {
        const width = this.container.clientWidth
        return Number.isFinite(width) ? width : 0
    }

    render(snapshots: Snapshot[], selectedId: string | null): void {
        this.railHadFocus =
            this.railEl !== null && this.railEl.ownerDocument.activeElement === this.railEl

        this.snapshots = snapshots
        this.selectedId = selectedId
        this.railEl = null
        this.container.empty()

        if (snapshots.length === 0) return

        const rail = computeVersionRail(snapshots, this.measure(), Date.now())
        const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null

        // One version means nothing to navigate between — the details still
        // render, matching the long-standing rule for the old slider.
        if (snapshots.length > 1) {
            this.renderRail(rail)
        }

        this.renderDetails(selected, rail)
    }

    private renderRail(rail: VersionRail): void {
        const row = this.container.createDiv({ cls: 'tm-rail-row' })

        this.renderNavButton(row, 'chevron-left', 'Newer version', () => {
            this.step(-1)
        })

        const rail_ = row.createDiv({ cls: 'tm-rail' })
        rail_.tabIndex = 0
        this.applyRailAria(rail_)
        this.railEl = rail_

        this.renderNavButton(row, 'chevron-right', 'Older version', () => {
            this.step(1)
        })

        rail_.addEventListener('keydown', (event: KeyboardEvent) => {
            const handled = this.handleKey(event.key)
            if (handled) event.preventDefault()
        })

        for (const group of rail.groups) {
            this.renderGroup(rail_, group, rail.tier)
        }

        // Keep the keyboard on the rail across the re-render each selection triggers.
        if (this.railHadFocus) rail_.focus()
    }

    private renderNavButton(
        parent: HTMLElement,
        icon: string,
        label: string,
        onClick: () => void
    ): void {
        const btn = parent.createEl('button', {
            cls: 'tm-rail-nav clickable-icon',
            attr: { 'aria-label': label }
        })
        setIcon(btn, icon)
        btn.addEventListener('click', onClick)
    }

    private applyRailAria(rail: HTMLElement): void {
        const index = this.snapshots.findIndex((snapshot) => snapshot.id === this.selectedId)
        const last = this.snapshots.length - 1

        rail.setAttribute('role', 'slider')
        rail.setAttribute('aria-label', 'Version history')
        rail.setAttribute('aria-valuemin', '0')
        rail.setAttribute('aria-valuemax', String(last))

        if (index === -1) return
        const selected = this.snapshots[index]
        // Expressed oldest-to-newest so "increasing" reads as moving forward in time.
        rail.setAttribute('aria-valuenow', String(last - index))
        if (selected) {
            rail.setAttribute(
                'aria-valuetext',
                `Version ${String(last - index + 1)} of ${String(this.snapshots.length)}, ${formatRelativeTime(selected.ts)}`
            )
        }
    }

    private renderGroup(parent: HTMLElement, group: RailGroup, tier: VersionRail['tier']): void {
        const groupEl = parent.createDiv({ cls: 'tm-rail-group' })
        // The group grows in proportion to how many versions it holds, so a busy
        // day is visibly busier without any one version becoming unclickable.
        groupEl.style.setProperty('flex-grow', String(group.segments.length))

        if (tier !== 'minimal') {
            // Always the short form. A group holding one version is only ~40px
            // wide, so "This week" and "This month" both truncated to
            // "THIS…" — two different groups rendering identically. The full
            // label stays available as a tooltip.
            groupEl.createDiv({
                cls: 'tm-rail-group-label',
                text: group.shortLabel,
                attr: { title: group.label }
            })
        }

        const segmentsEl = groupEl.createDiv({ cls: 'tm-rail-track' })

        for (const segment of group.segments) {
            const isSelected = segment.id === this.selectedId
            const classes = ['tm-rail-segment', `is-${segment.source}`]
            if (isSelected) classes.push('is-selected')

            const label = `${formatBackupDate(segment.ts)} — ${formatRelativeTime(segment.ts)}${
                segment.source === 'git' ? ' (git commit)' : ''
            }`

            const segmentEl = segmentsEl.createDiv({
                cls: classes.join(' '),
                attr: { 'aria-label': label, 'title': label }
            })

            segmentEl.addEventListener('click', () => {
                this.callbacks.onSelect(segment.id)
            })
        }
    }

    private renderDetails(selected: Snapshot | null, rail: VersionRail): void {
        if (!selected) return

        const details = this.container.createDiv({ cls: 'tm-rail-details' })

        const position = this.snapshots.findIndex((snapshot) => snapshot.id === selected.id)
        if (position !== -1 && rail.total > 1) {
            details.createSpan({
                cls: 'tm-rail-position',
                text: `${String(rail.total - position)} of ${String(rail.total)}`
            })
        }

        // The relative time is what people actually read; the absolute date is
        // the tooltip. Printing both, plus a third "Snapshot (date)" line, was
        // the same timestamp three times over.
        details.createSpan({
            cls: 'tm-rail-when',
            text: formatRelativeTime(selected.ts),
            attr: { title: formatBackupDate(selected.ts) }
        })

        const source = details.createSpan({ cls: 'tm-rail-source' })
        const icon = source.createSpan({ cls: 'tm-rail-source-icon' })
        setIcon(icon, selected.source === 'git' ? 'git-branch' : 'clock')
        source.createSpan({
            text: selected.source === 'git' ? 'Git commit' : 'File recovery'
        })
    }

    /** @returns whether the key was consumed. */
    private handleKey(key: string): boolean {
        if (key === 'ArrowLeft') return this.step(-1)
        if (key === 'ArrowRight') return this.step(1)
        if (key === 'Home') return this.jump('newest')
        if (key === 'End') return this.jump('oldest')
        return false
    }

    private step(direction: -1 | 1): boolean {
        const next = stepSelection(this.snapshots, this.selectedId, direction)
        if (next !== null && next !== this.selectedId) {
            this.callbacks.onSelect(next)
            return true
        }
        // Consumed even at the edge, so the pane does not scroll instead.
        return true
    }

    private jump(edge: 'newest' | 'oldest'): boolean {
        const target = edgeSelection(this.snapshots, edge)
        if (target !== null && target !== this.selectedId) {
            this.callbacks.onSelect(target)
        }
        return true
    }

    /** Re-measures and re-renders; called from the host view's `onResize`. */
    handleResize(): void {
        if (this.snapshots.length === 0) return
        this.render(this.snapshots, this.selectedId)
    }
}

export { findSegment }
