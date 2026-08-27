import { setIcon } from 'obsidian'
import type { Snapshot } from '../../types/snapshot.intf'
import {
    computeVersionRail,
    edgeSelection,
    findSegment,
    pageSelection,
    stepSelection,
    type RailGroup,
    type VersionRail
} from '../../domain/timeline-layout'
import { formatBackupDate, formatRelativeTime } from '../../domain/backup'
import type { GitMetadata } from '../../types/snapshot.intf'

/** Kept in step with the gap and min/max width in `styles.src.css`. */
const SEGMENT_GAP_PX = 2
const GROUP_GAP_PX = 12
const SEGMENT_MIN_PX = 14
const SEGMENT_MAX_PX = 40

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
    /** The selected segment's element, so it can be scrolled into view. */
    private selectedEl: HTMLElement | null = null
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
        this.selectedEl = null
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

        // Measure immediately — reading `clientWidth` forces layout, so this is
        // accurate as soon as the element is in the document.
        this.applySegmentWidth(rail_, rail)
        this.revealSelected()

        // ...and once more on a timer, for the case where the rail is not laid
        // out yet (a view rendered while its leaf is hidden reports zero width).
        // Deliberately a timeout rather than requestAnimationFrame: rAF does not
        // run while the window is not painting, so a render in a background tab
        // or an unfocused window would never get sized at all.
        this.container.win.setTimeout(() => {
            if (this.railEl !== rail_) return
            this.applySegmentWidth(rail_, rail)
            this.revealSelected()
        }, 0)
    }

    /**
     * Gives every segment on the rail one shared width.
     *
     * Segments cannot simply flex: each bucket is its own flex context, so a
     * bucket holding one version would draw a fatter segment than a bucket
     * holding twenty. Computing a single width here keeps them uniform, and
     * lets a short history spread out — two versions as two lost 14px specks in
     * a wide pane looks broken — while a long one shrinks to the minimum and
     * scrolls.
     */
    private applySegmentWidth(railEl: HTMLElement, rail: VersionRail): void {
        const total = rail.total
        if (total === 0) return

        const available = railEl.clientWidth
        if (available <= 0) return

        const intraGroupGaps = (total - rail.groups.length) * SEGMENT_GAP_PX
        const interGroupGaps = Math.max(0, rail.groups.length - 1) * GROUP_GAP_PX
        const usable = available - intraGroupGaps - interGroupGaps

        const ideal = Math.floor(usable / total)
        const width = Math.max(SEGMENT_MIN_PX, Math.min(SEGMENT_MAX_PX, ideal))

        railEl.style.setProperty('--tm-segment-width', `${String(width)}px`)
    }

    /**
     * Scrolls the selected version into view when the rail overflows.
     *
     * A note with hundreds of file-recovery snapshots cannot fit one usable
     * segment each, so the rail scrolls rather than shrinking segments below a
     * clickable size — but then stepping with the arrow keys would walk the
     * selection off-screen without this.
     */
    private revealSelected(): void {
        const rail = this.railEl
        const selected = this.selectedEl
        if (!rail || !selected) return
        if (rail.scrollWidth <= rail.clientWidth) return

        const railBox = rail.getBoundingClientRect()
        const box = selected.getBoundingClientRect()
        // Only scroll when it is actually out of view, so a user who has
        // scrolled to look around is not yanked back on every re-render.
        if (box.left >= railBox.left && box.right <= railBox.right) return

        const offset = box.left - railBox.left + rail.scrollLeft
        rail.scrollLeft = offset - rail.clientWidth / 2 + box.width / 2
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
        const total = this.snapshots.length

        rail.setAttribute('role', 'slider')
        // Obsidian renders `aria-label` as a tooltip, so hovering the rail
        // between segments used to pop a bare "Version history". Summarise the
        // history instead, so every hover says something worth reading.
        rail.setAttribute('aria-label', this.describeHistory())
        // The value follows *visual* position: 1 is the leftmost (newest)
        // segment. Numbering by age instead ran backwards against the rail, and
        // inverted the slider contract — ArrowRight moved right but decreased
        // the value, and Home/End were swapped.
        rail.setAttribute('aria-valuemin', '1')
        rail.setAttribute('aria-valuemax', String(Math.max(total, 1)))

        const selected = index === -1 ? null : this.snapshots[index]
        if (!selected) {
            // A slider must always carry a value, even with nothing selected.
            rail.setAttribute('aria-valuenow', '1')
            return
        }

        rail.setAttribute('aria-valuenow', String(index + 1))
        rail.setAttribute(
            'aria-valuetext',
            `Version ${String(index + 1)} of ${String(total)}, ${formatRelativeTime(selected.ts)}, ${describeSource(selected.source)}`
        )
    }

    private renderGroup(parent: HTMLElement, group: RailGroup, tier: VersionRail['tier']): void {
        // Sized by its contents. Growing groups proportionally was left over
        // from the days of flexible segments; with fixed-width segments it only
        // stretched each group into a wide empty box with its versions huddled
        // at the left edge.
        const groupEl = parent.createDiv({ cls: 'tm-rail-group' })

        if (tier !== 'minimal') {
            // Always the short form. A group holding one version is only ~40px
            // wide, so "This week" and "This month" both truncated to
            // "THIS…" — two different groups rendering identically. The full
            // label stays available as a tooltip.
            const labelEl = groupEl.createEl('button', {
                cls: 'tm-rail-group-label',
                text: group.shortLabel,
                attr: { 'title': `Jump to ${group.label}`, 'aria-label': `Jump to ${group.label}` }
            })
            // Jumping by bucket is the only quick way to cross a long history
            // without hundreds of arrow presses.
            labelEl.addEventListener('click', () => {
                const first = group.segments[0]
                if (first) this.callbacks.onSelect(first.id)
            })
        }

        const segmentsEl = groupEl.createDiv({ cls: 'tm-rail-track' })

        for (const segment of group.segments) {
            const isSelected = segment.id === this.selectedId
            const classes = ['tm-rail-segment', `is-${segment.source}`]
            if (isSelected) classes.push('is-selected')

            const snapshot = this.snapshots[segment.index]
            const label = this.describeVersion(segment.index, snapshot?.ts ?? segment.ts, snapshot)

            // `aria-label` only — Obsidian renders it as a tooltip, and adding
            // `title` as well pops a second, native one on top of it.
            const segmentEl = segmentsEl.createDiv({
                cls: classes.join(' '),
                attr: { 'aria-label': label }
            })
            if (isSelected) this.selectedEl = segmentEl

            segmentEl.addEventListener('click', () => {
                this.callbacks.onSelect(segment.id)
            })
        }
    }

    /** Whole-history summary, used as the rail's own tooltip. */
    private describeHistory(): string {
        const total = this.snapshots.length
        const newest = this.snapshots[0]
        const oldest = this.snapshots[total - 1]
        if (!newest || !oldest) return 'Version history'

        const versions = `${String(total)} version${total === 1 ? '' : 's'}`
        if (total === 1) return `${versions} · ${formatRelativeTime(newest.ts)}`
        return `${versions} · newest ${formatRelativeTime(newest.ts)} · oldest ${formatRelativeTime(oldest.ts)}`
    }

    /**
     * Everything needed to recognise a version without selecting it: position,
     * exact time to the second (several saves can land inside one minute), the
     * source by name, and the commit subject for git versions.
     */
    private describeVersion(index: number, ts: number, snapshot: Snapshot | undefined): string {
        const parts = [
            `Version ${String(index + 1)} of ${String(this.snapshots.length)}`,
            new Date(ts).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'medium'
            }),
            formatRelativeTime(ts)
        ]

        if (snapshot?.source === 'git') {
            const meta = snapshot.metadata as GitMetadata
            parts.push(`Git commit ${meta.shortHash} — ${meta.commitMessage}`)
        } else {
            parts.push('File recovery snapshot')
        }

        // Joined on one line: Obsidian's tooltip does not honour newlines.
        return parts.join(' · ')
    }

    private renderDetails(selected: Snapshot | null, rail: VersionRail): void {
        if (!selected) return

        const details = this.container.createDiv({ cls: 'tm-rail-details' })

        const position = this.snapshots.findIndex((snapshot) => snapshot.id === selected.id)
        if (position !== -1 && rail.total > 1) {
            // Counted from the left, like the rail. Counting by age made the
            // leftmost segment read "10 of 10".
            details.createSpan({
                cls: 'tm-rail-position',
                text: `${String(position + 1)} of ${String(rail.total)}`
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
        source.createSpan({ text: describeSource(selected.source) })
    }

    /** @returns whether the key was consumed. */
    private handleKey(key: string): boolean {
        if (key === 'ArrowLeft') return this.step(-1)
        if (key === 'ArrowRight') return this.step(1)
        if (key === 'Home') return this.jump('newest')
        if (key === 'End') return this.jump('oldest')
        if (key === 'PageUp') return this.page(-1)
        if (key === 'PageDown') return this.page(1)
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

    private page(direction: -1 | 1): boolean {
        const target = pageSelection(this.snapshots, this.selectedId, direction)
        if (target !== null && target !== this.selectedId) {
            this.callbacks.onSelect(target)
        }
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

function describeSource(source: Snapshot['source']): string {
    return source === 'git' ? 'Git commit' : 'File recovery'
}

export { findSegment }
