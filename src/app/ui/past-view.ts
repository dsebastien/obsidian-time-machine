import {
    Component,
    ItemView,
    MarkdownRenderer,
    Menu,
    Notice,
    setIcon,
    type TFile,
    type ViewStateResult,
    type WorkspaceLeaf
} from 'obsidian'
import { PAST_VIEW_TYPE, PLUGIN_NAME } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import type { DiffComparisonMode } from '../types/plugin-settings.intf'
import type { GitMetadata } from '../types/snapshot.intf'
import { SnapshotSession } from '../domain/snapshot-session'
import {
    DEFAULT_PAST_VIEW_STATE,
    normalisePastViewState,
    type PastViewState
} from '../domain/past-view-state'
import { neutraliseExecutableBlocks } from '../domain/markdown-safety'
import { formatBackupDate, formatRelativeTime } from '../domain/backup'
import { RestoreService } from '../services/restore.service'
import { NoteExportService } from '../services/note-export.service'
import { renderEmptyState } from './components/empty-state'
import { TimelineBarComponent } from './components/timeline-bar'
import { DiffViewerComponent } from './components/diff-viewer'
import { renderComparisonModeControl } from './components/comparison-mode-control'
import { showConfirmDialog } from './components/confirm-modal'
import type { HistoryView } from './history-view'
import { log } from '../../utils/log'

/**
 * Read-only view of a note as it was at a chosen snapshot.
 *
 * Opened in a native split before the leaf holding the live editor, so the user
 * gets old-version-left / real-editable-note-right with Obsidian's own
 * splitter. Opened as a tab instead when there is no room to split (mobile),
 * which is the full-width "past view".
 *
 * The live file is never written to for display purposes: swapping the real
 * editor's content would dirty the file, fire `modify`, and pollute
 * file-recovery with versions the user never typed.
 */
export class PastView extends ItemView implements HistoryView {
    private readonly plugin: TimeMachinePlugin
    private readonly session: SnapshotSession

    private state: PastViewState = { ...DEFAULT_PAST_VIEW_STATE }

    private tmHeaderEl!: HTMLElement
    private bodyEl!: HTMLElement
    private timelineBar: TimelineBarComponent | null = null
    private diffViewer: DiffViewerComponent | null = null

    /**
     * Component owning whatever `MarkdownRenderer.render` created. The renderer
     * takes a *parent* that manages the rendered children — emptying the DOM
     * does not unload them, so the previous one is removed explicitly.
     */
    private renderChild: Component | null = null
    /** Guards async markdown rendering against a newer render finishing first. */
    private renderGeneration = 0

    /** True while `setState` is applying saved state, so it is not re-saved. */
    private hydrating = false

    // Static, in Obsidian's sense: opening a file must never replace this view.
    // That protection used to come from pinning the leaf, which showed a pin
    // marker on the tab and invited the user to unpin it — at which point
    // opening any note would silently destroy the view.
    override navigation = false

    constructor(leaf: WorkspaceLeaf, plugin: TimeMachinePlugin) {
        super(leaf)
        this.plugin = plugin
        this.session = new SnapshotSession(
            () => this.app,
            plugin.snapshotCache,
            () => this.plugin.settings
        )
    }

    override getViewType(): string {
        return PAST_VIEW_TYPE
    }

    override getDisplayText(): string {
        const name = this.session.file?.name
        return name ? `${PLUGIN_NAME}: ${name}` : PLUGIN_NAME
    }

    override getIcon(): string {
        return 'columns-2'
    }

    getCurrentFile(): TFile | null {
        return this.session.file
    }

    followsActiveFile(): boolean {
        return !this.state.boundToFile
    }

    // --- state persistence -------------------------------------------------

    override getState(): Record<string, unknown> {
        return {
            filePath: this.session.file?.path ?? this.state.filePath,
            boundToFile: this.state.boundToFile,
            snapshotId: this.session.getSelectedId(),
            snapshotTimestamp: this.session.getSelectedTs(),
            showDiff: this.state.showDiff
        }
    }

    override async setState(state: unknown, result: ViewStateResult): Promise<void> {
        this.hydrating = true
        this.state = normalisePastViewState(state)
        this.session.restoreSelection(
            this.state.snapshotId,
            this.state.snapshotTimestamp,
            this.state.filePath
        )

        const path = this.state.filePath
        const file = path === null ? null : this.app.vault.getFileByPath(path)

        // The note may have been renamed or deleted since the layout was saved.
        // That is an empty state, not a crash.
        try {
            await this.updateForFile(file)
        } finally {
            this.hydrating = false
        }
        await super.setState(state, result)
    }

    /**
     * `setState` alone does not schedule a layout save, so persistent changes
     * made from inside the view would be lost on restart without this.
     */
    private persist(): void {
        this.app.workspace.requestSaveLayout()
    }

    // --- lifecycle ---------------------------------------------------------

    override async onOpen(): Promise<void> {
        const container = this.containerEl.children[1]
        if (!container) return

        container.empty()
        const root = container as HTMLElement
        root.addClass('tm-root', 'tm-past-root')

        // Earlier versions pinned the leaf to stop Obsidian recycling it for a
        // file. `navigation = false` does that without a pin marker on the tab,
        // so any pin left over from a saved workspace is pure annoyance.
        if (this.leaf.getViewState().pinned === true) {
            this.leaf.setPinned(false)
        }

        this.tmHeaderEl = root.createDiv({ cls: 'tm-past-header' })
        this.bodyEl = root.createDiv({ cls: 'tm-past-body' })

        if (this.session.file) {
            this.renderAll()
        } else {
            renderEmptyState(this.bodyEl, 'no-file')
        }
    }

    override async onClose(): Promise<void> {
        this.clearRenderChild()
        await this.session.loadFor(null)
    }

    override onResize(): void {
        this.timelineBar?.handleResize()
    }

    private clearRenderChild(): void {
        // Invalidate any in-flight markdown render: its results belong to a body
        // state that is about to be replaced.
        this.renderGeneration++
        if (this.renderChild) {
            this.removeChild(this.renderChild)
            this.renderChild = null
        }
    }

    // --- data --------------------------------------------------------------

    async updateForFile(file: TFile | null): Promise<void> {
        const outcome = await this.session.loadFor(file)
        if (outcome === 'superseded') return

        const previousPath = this.state.filePath
        this.state.filePath = file?.path ?? null
        // Persist the note the view ended up on, or a restart reopens the old
        // one. Skipped during setState hydration, which is already the saved state.
        if (previousPath !== this.state.filePath && !this.hydrating) this.persist()

        // `bodyEl` is undefined until onOpen runs; setState can land first.
        if (!this.bodyEl) return

        this.renderAll()
    }

    async refreshCurrentContent(): Promise<void> {
        if (!this.session.file || this.session.allSnapshots.length === 0) return

        const outcome = await this.session.refreshContent()
        if (outcome === 'superseded') return

        if (outcome === 'updated') {
            this.renderAll()
            return
        }

        // Same snapshots, but the content they are compared against changed.
        await this.renderBody()
    }

    onComparisonModeChanged(): void {
        if (!this.session.file) return
        this.renderAll()
    }

    // --- rendering ---------------------------------------------------------

    private renderAll(): void {
        this.renderHeader()
        void this.renderBody()
    }

    private renderHeader(): void {
        this.tmHeaderEl.empty()

        const file = this.session.file
        if (!file) return

        const titleRow = this.tmHeaderEl.createDiv({ cls: 'tm-past-title-row' })
        titleRow.createDiv({
            cls: 'tm-header-file',
            text: file.name,
            attr: { 'aria-label': file.path }
        })

        const count = this.session.snapshots.length
        titleRow.createDiv({
            cls: 'tm-header-count',
            text: `${String(count)} version${count === 1 ? '' : 's'}`
        })

        this.renderBindToggle(titleRow)

        // With no history there is nothing to navigate, compare or restore, so
        // none of the controls render — including the actions menu, which would
        // otherwise offer restores with nothing selected (issue #9).
        if (count === 0) return

        this.renderActionsMenu(titleRow)

        this.timelineBar = new TimelineBarComponent(this.tmHeaderEl, {
            onSelect: (snapshotId) => {
                this.session.select(snapshotId)
                this.persist()
                this.timelineBar?.render(this.session.snapshots, this.session.getSelectedId())
                void this.renderBody()
            }
        })
        this.timelineBar.render(this.session.snapshots, this.session.getSelectedId())

        this.renderCommitMeta()

        const controls = this.tmHeaderEl.createDiv({ cls: 'tm-past-controls' })
        this.renderDiffToggle(controls)
        if (this.state.showDiff) {
            renderComparisonModeControl(
                controls,
                this.plugin.settings.diffComparisonMode,
                (mode: DiffComparisonMode) => {
                    void this.plugin.setComparisonMode(mode)
                }
            )
        }
    }

    private renderCommitMeta(): void {
        const snapshot = this.session.selectedSnapshot
        if (!snapshot || snapshot.source !== 'git') return

        const meta = snapshot.metadata as GitMetadata
        const el = this.tmHeaderEl.createDiv({ cls: 'tm-past-commit' })
        el.createSpan({ cls: 'tm-past-commit-hash', text: meta.shortHash })
        el.createSpan({ cls: 'tm-past-commit-message', text: meta.commitMessage })
        el.createSpan({ cls: 'tm-past-commit-author', text: meta.authorName })
    }

    private renderBindToggle(parent: HTMLElement): void {
        const btn = parent.createEl('button', {
            cls: 'tm-past-bind clickable-icon' + (this.state.boundToFile ? ' is-active' : ''),
            attr: {
                'aria-label': this.state.boundToFile
                    ? 'Bound to this note — click to follow the active note'
                    : 'Following the active note — click to bind to this one',
                'aria-pressed': String(this.state.boundToFile)
            }
        })
        setIcon(btn, this.state.boundToFile ? 'pin' : 'pin-off')
        btn.addEventListener('click', () => {
            this.state.boundToFile = !this.state.boundToFile
            this.persist()
            this.renderHeader()

            // Switching to follow mode should follow *now*, not wait for the
            // next workspace event.
            if (!this.state.boundToFile) {
                const active = this.plugin.resolveActiveFile()
                if (active && active.path !== this.session.file?.path) {
                    void this.updateForFile(active)
                }
            }
        })
    }

    private renderDiffToggle(parent: HTMLElement): void {
        const btn = parent.createEl('button', {
            cls: 'tm-past-diff-toggle' + (this.state.showDiff ? ' is-active' : ''),
            text: this.state.showDiff ? 'Showing changes' : 'Show changes',
            attr: {
                'aria-pressed': String(this.state.showDiff),
                'aria-label': this.state.showDiff
                    ? 'Showing what changed — click to see the version itself'
                    : 'Show what changed between this version and the note'
            }
        })
        const icon = btn.createSpan({ cls: 'tm-past-diff-toggle-icon' })
        setIcon(icon, 'git-compare')
        btn.prepend(icon)
        btn.addEventListener('click', () => {
            this.state.showDiff = !this.state.showDiff
            this.persist()
            this.renderHeader()
            void this.renderBody()
        })
    }

    private async renderBody(): Promise<void> {
        if (!this.bodyEl) return

        const file = this.session.file
        if (!file) {
            this.clearRenderChild()
            this.bodyEl.empty()
            renderEmptyState(this.bodyEl, 'no-file')
            return
        }

        if (this.session.snapshots.length === 0) {
            this.clearRenderChild()
            this.bodyEl.empty()
            renderEmptyState(this.bodyEl, 'no-snapshots')
            return
        }

        if (this.state.showDiff) {
            await this.renderDiffBody()
            return
        }

        await this.renderVersionBody()
    }

    private async renderDiffBody(): Promise<void> {
        this.clearRenderChild()
        this.bodyEl.empty()

        const container = this.bodyEl.createDiv({ cls: 'tm-diff-container' })
        this.diffViewer = new DiffViewerComponent(container, {
            onRestoreHunk: (hunkIndex) => {
                void this.handleRestoreHunk(hunkIndex)
            }
        })

        const result = await this.session.computeDiff()
        if (!result) return
        this.diffViewer.render(result.diff, { allowHunkRestore: !result.historical })
    }

    private async renderVersionBody(): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return

        // Executable blocks are defused BEFORE rendering: MarkdownRenderer runs
        // every registered post-processor, so a dataviewjs block from an old
        // version would execute — including one the user has since deleted.
        const { markdown, neutralised } = this.plugin.settings.pastViewExecuteBlocks
            ? { markdown: snapshot.data, neutralised: [] as string[] }
            : neutraliseExecutableBlocks(snapshot.data)

        this.clearRenderChild()
        const generation = this.renderGeneration
        this.bodyEl.empty()

        if (neutralised.length > 0) {
            const notice = this.bodyEl.createDiv({ cls: 'tm-past-neutralised' })
            const icon = notice.createSpan({ cls: 'tm-past-neutralised-icon' })
            setIcon(icon, 'shield')
            notice.createSpan({
                text: `${String(neutralised.length)} executable block${neutralised.length === 1 ? '' : 's'} shown as source`
            })
        }

        // `markdown-preview-view markdown-rendered` gives the rendered output
        // reading-view styling; without them it inherits nothing.
        const rendered = this.bodyEl.createDiv({
            cls: 'tm-past-rendered markdown-preview-view markdown-rendered'
        })

        const child = new Component()
        this.addChild(child)
        this.renderChild = child

        try {
            // The real source path is passed so relative links and embeds
            // resolve. Note this renders historical *source* against today's
            // vault — embeds and queries reflect the vault as it is now.
            await MarkdownRenderer.render(this.app, markdown, rendered, file.path, child)
        } catch (error) {
            log('Failed to render historical version', 'error', error)
        }

        if (generation !== this.renderGeneration) {
            // A newer body render started while this one was awaiting. It has
            // already replaced `renderChild`, so unload ours directly rather
            // than leaving a live component attached to detached DOM.
            this.removeChild(child)
        }
    }

    // --- actions -----------------------------------------------------------

    private renderActionsMenu(parent: HTMLElement): void {
        const btn = parent.createEl('button', {
            cls: 'tm-past-actions clickable-icon',
            attr: { 'aria-label': 'Actions' }
        })
        setIcon(btn, 'more-vertical')

        btn.addEventListener('click', (event: MouseEvent) => {
            const menu = new Menu()
            const hasSelection = this.session.selectedSnapshot !== null

            menu.addItem((item) =>
                item
                    .setTitle('Restore entire version')
                    .setIcon('rotate-ccw')
                    .setDisabled(!hasSelection)
                    .onClick(() => {
                        void this.handleRestoreFullVersion()
                    })
            )
            menu.addItem((item) =>
                item
                    .setTitle('Copy this version')
                    .setIcon('copy')
                    .setDisabled(!hasSelection)
                    .onClick(() => {
                        void this.handleCopyVersion()
                    })
            )
            menu.addItem((item) =>
                item
                    .setTitle('Open this version as a new note')
                    .setIcon('file-plus')
                    .setDisabled(!hasSelection)
                    .onClick(() => {
                        void this.handleOpenAsNewNote()
                    })
            )

            menu.showAtMouseEvent(event)
        })
    }

    private async handleRestoreFullVersion(): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return
        // Refuse a snapshot that does not belong to this note. Both are read
        // from session state that a concurrent load could have moved on from.
        if (snapshot.path !== file.path) return

        const confirmed = await showConfirmDialog(
            this.app,
            'Restore version',
            `Restore "${file.name}" to the version from ${formatBackupDate(snapshot.ts)} (${formatRelativeTime(snapshot.ts)})? The current content will be replaced.`
        )
        if (!confirmed) return

        await RestoreService.restoreFullVersion(this.app, file, snapshot.data)
        await this.updateForFile(file)
    }

    private async handleRestoreHunk(hunkIndex: number): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return
        // Refuse a snapshot that does not belong to this note. Both are read
        // from session state that a concurrent load could have moved on from.
        if (snapshot.path !== file.path) return
        if (this.plugin.settings.diffComparisonMode === 'next') return

        const currentContent = await this.app.vault.read(file)

        // The rendered hunks are addressed against the content the diff was
        // computed from. If the live file moved on, the ordinal no longer points
        // at the same change.
        // A null base means no diff has been rendered for this state yet, so
        // the hunk ordinal addresses nothing — refuse rather than guess.
        if (
            this.session.diffBaseContent === null ||
            currentContent !== this.session.diffBaseContent
        ) {
            new Notice('Time Machine: the file changed — the diff was refreshed, try again.')
            await this.renderBody()
            return
        }

        const success = await RestoreService.restoreHunk(
            this.app,
            file,
            currentContent,
            snapshot.data,
            hunkIndex
        )
        if (success) await this.renderBody()
    }

    private async handleCopyVersion(): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        if (!snapshot) return

        try {
            await navigator.clipboard.writeText(snapshot.data)
            new Notice('Time Machine: version copied to clipboard')
        } catch (error) {
            log('Clipboard write failed', 'error', error)
            new Notice('Time Machine: could not copy to the clipboard')
        }
    }

    private async handleOpenAsNewNote(): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return

        const created = await NoteExportService.createFromSnapshot(
            this.app,
            file,
            snapshot.data,
            snapshot.ts
        )
        if (!created) return

        try {
            await this.app.workspace.getLeaf('tab').openFile(created)
        } catch (error) {
            log('Could not open created note', 'error', error)
            new Notice(`Time Machine: Created "${created.name}" but could not open it`)
        }
    }
}
