import { registerWhatsNewView } from './whats-new'
import {
    Menu,
    Notice,
    Plugin,
    TFile,
    debounce,
    type TAbstractFile,
    type WorkspaceLeaf
} from 'obsidian'
import { DEFAULT_SETTINGS } from './types/plugin-settings.intf'
import type { PluginSettings } from './types/plugin-settings.intf'
import { TimeMachineSettingTab } from './settings/settings-tab'
import { log } from '../utils/log'
import { PAST_VIEW_TYPE, VIEW_TYPE } from './constants'
import { TimeMachineView } from './ui/time-machine-view'
import { registerCommands } from './commands/register-commands'
import { FileRecoveryService } from './services/file-recovery.service'
import { SnapshotCache } from './services/snapshot-cache'
import { PastView } from './ui/past-view'
import { openPastView } from './services/past-view-launcher'
import type { HistoryView } from './ui/history-view'
import type { DiffComparisonMode } from './types/plugin-settings.intf'

export class TimeMachinePlugin extends Plugin {
    settings: PluginSettings = { ...DEFAULT_SETTINGS }

    /** Shared so several open views never fetch the same snapshots twice. */
    readonly snapshotCache = new SnapshotCache()

    private pastViewRibbonEl: HTMLElement | null = null

    /** Hides the ribbon icon outright when the past view is disabled. */
    syncPastViewRibbon(): void {
        if (!this.pastViewRibbonEl) return
        this.pastViewRibbonEl.toggleClass('tm-hidden', !this.settings.pastViewEnabled)
    }

    /**
     * Re-renders every open history view. Used when a setting changes what they
     * display — notably `pastViewExecuteBlocks`, where leaving an already
     * rendered version on screen would keep executing code the user just
     * switched off.
     */
    refreshAllViews(): void {
        for (const view of this.getHistoryViews()) {
            const file = view.getCurrentFile()
            if (file) void view.updateForFile(file)
        }
    }

    override async onload(): Promise<void> {
        // Must run before anything can call saveData (fresh-install detection)
        registerWhatsNewView(this)
        log('Initializing', 'debug')
        await this.loadSettings()

        if (!FileRecoveryService.isAvailable(this.app)) {
            new Notice(
                'Time Machine: File Recovery core plugin is not enabled. Please enable it in Settings → Core plugins.'
            )
        }

        this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new TimeMachineView(leaf, this))
        this.registerView(PAST_VIEW_TYPE, (leaf: WorkspaceLeaf) => new PastView(leaf, this))
        registerCommands(this)

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                for (const view of this.getFollowingViews()) {
                    void view.updateForFile(file)
                }
            })
        )

        // Continuous-scroll plugins (e.g. Daily Notes Editor) render several notes
        // inside a single leaf, so `file-open` does not fire when the cursor moves
        // between notes. Track caret movement and switch the view to the note the
        // cursor is actually in, resolved via `workspace.activeEditor.file`.
        const debouncedCursorSync = debounce(() => this.syncToCursorFile(), 150, true)
        // Debouncers hold a pending timer that would otherwise fire after
        // unload, touching a half-torn-down plugin.
        this.register(() => debouncedCursorSync.cancel())
        this.registerDomEvent(activeDocument, 'selectionchange', debouncedCursorSync)
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                // Focusing one of the plugin's own views (e.g. clicking a
                // timeline tick) must not switch the displayed file.
                if (leaf?.view instanceof TimeMachineView) return
                if (leaf?.view instanceof PastView) return
                this.syncToCursorFile()
            })
        )

        const debouncedRefresh = debounce(
            () => {
                for (const view of this.getHistoryViews()) {
                    void view.refreshCurrentContent()
                }
            },
            1000,
            true
        )

        this.register(() => debouncedRefresh.cancel())

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                for (const view of this.getHistoryViews()) {
                    if (view.getCurrentFile()?.path === file.path) {
                        debouncedRefresh()
                        return
                    }
                }
            })
        )

        const snapshotIntervalMs = FileRecoveryService.getSnapshotIntervalMs(this.app)
        log(`Snapshot poll interval: ${snapshotIntervalMs / 1000}s`, 'debug')
        this.registerInterval(
            window.setInterval(() => {
                for (const view of this.getHistoryViews()) {
                    const currentFile = view.getCurrentFile()
                    if (currentFile) {
                        void view.updateForFile(currentFile)
                    }
                }
            }, snapshotIntervalMs)
        )

        this.registerPastViewEntryPoints()
        this.addSettingTab(new TimeMachineSettingTab(this.app, this))
    }

    /**
     * Ribbon icon and context-menu items for the past view. The command lives in
     * `register-commands`; all four entry points share `openPastView`.
     */
    private registerPastViewEntryPoints(): void {
        this.pastViewRibbonEl = this.addRibbonIcon(
            'history',
            'Open past view for current note',
            () => {
                const file = this.resolveActiveFile()
                if (!file || file.extension !== 'md') {
                    new Notice('Time Machine: Open a markdown note first')
                    return
                }
                void openPastView(this, file)
            }
        )
        this.syncPastViewRibbon()

        const addMenuItem = (menu: Menu, file: TAbstractFile | null): void => {
            if (!this.settings.pastViewEnabled) return
            // `file-menu` hands over a TAbstractFile, which may be a folder.
            if (!(file instanceof TFile) || file.extension !== 'md') return

            menu.addItem((item) =>
                item
                    .setTitle('Compare versions side by side')
                    .setIcon('columns-2')
                    .onClick(() => {
                        void openPastView(this, file)
                    })
            )
        }

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                addMenuItem(menu, file)
            })
        )
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, _editor, info) => {
                addMenuItem(menu, info.file)
            })
        )
    }

    /**
     * Resolves the file to show when the view first opens, preferring the
     * focused editor (`activeEditor.file`) over the leaf-level active file.
     * The `getActiveFile()` fallback is only safe here: it returns the most
     * recently opened file, which is fine as an initial guess but must never
     * drive cursor-following (see syncToCursorFile).
     */
    resolveActiveFile(): TFile | null {
        return this.app.workspace.activeEditor?.file ?? this.app.workspace.getActiveFile()
    }

    /**
     * Switches open views to the file the cursor is in, if it changed. Only
     * acts when a file is resolved so caret moves into non-editor surfaces (the
     * sidebar, the view itself) never clear the displayed history.
     *
     * Resolution deliberately trusts ONLY `activeEditor.file` — never
     * `getActiveFile()`. Notes rendered inside a continuous-scroll pane
     * (e.g. Daily Notes Editor) are never "opened" in a leaf, so
     * `getActiveFile()` reports the most recently opened file instead — in a
     * split that is the *other* pane's note. Any sync firing while
     * `activeEditor` is momentarily null (focus moving into the sidebar,
     * `active-leaf-change` during a slider mousedown, ...) would then switch
     * the view to that other note (issue #7). Regular tab switches are already
     * covered by the `file-open` event, so no fallback is needed here.
     */
    private syncToCursorFile(): void {
        // Extra belt: skip while the user is interacting with the Time Machine
        // view itself (e.g. dragging the timeline slider).
        if (this.isFocusInsideOwnView()) return

        const file = this.app.workspace.activeEditor?.file ?? null
        if (!file) return

        for (const view of this.getFollowingViews()) {
            if (view.getCurrentFile()?.path !== file.path) {
                void view.updateForFile(file)
            }
        }
    }

    /**
     * Whether the currently focused element lives inside one of the plugin's own
     * views. Used to leave the displayed history untouched while the user
     * interacts with the Time Machine pane (slider, restore buttons, ...).
     */
    private isFocusInsideOwnView(): boolean {
        const active = activeDocument.activeElement
        if (!active) return false
        return this.getHistoryViews().some((view) => view.containerEl.contains(active))
    }

    /** Every open history surface, sidebar and past view alike. */
    getHistoryViews(): HistoryView[] {
        const views: HistoryView[] = []
        for (const type of [VIEW_TYPE, PAST_VIEW_TYPE]) {
            for (const leaf of this.app.workspace.getLeavesOfType(type)) {
                const view = leaf.view
                if (view instanceof TimeMachineView || view instanceof PastView) {
                    views.push(view)
                }
            }
        }
        return views
    }

    /**
     * History views that should switch when the active file changes. A past view
     * bound to its note deliberately does not — that is the whole point of it.
     */
    private getFollowingViews(): HistoryView[] {
        return this.getHistoryViews().filter((view) => view.followsActiveFile())
    }

    /**
     * Single entry point for comparison-mode changes. The setting is shared, so
     * every open view has to be told; otherwise two views disagree about the
     * mode they are both supposedly reading from settings.
     */
    async setComparisonMode(mode: DiffComparisonMode): Promise<void> {
        if (this.settings.diffComparisonMode === mode) return
        this.settings.diffComparisonMode = mode
        await this.saveSettings()
        for (const view of this.getHistoryViews()) {
            view.onComparisonModeChanged()
        }
    }

    override onunload(): void {
        log('Unloading', 'debug')
    }

    async activateView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)
        if (existing.length > 0) {
            const leaf = existing[0]
            if (leaf) {
                await this.app.workspace.revealLeaf(leaf)
            }
            return
        }

        const leaf = this.app.workspace.getRightLeaf(false)
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE, active: true })
            await this.app.workspace.revealLeaf(leaf)
        }
    }

    async loadSettings(): Promise<void> {
        log('Loading settings', 'debug')
        const loadedSettings = (await this.loadData()) as PluginSettings | null

        if (!loadedSettings) {
            log('Using default settings', 'debug')
            // Assigned explicitly rather than left to the field initialiser, so
            // this method is correct on its own.
            this.settings = { ...DEFAULT_SETTINGS }
            return
        }

        // Pick only known keys. A spread of the raw payload carries unknown
        // keys from older versions (or other tools) into `settings`, and
        // `saveSettings` then writes them straight back out, so the file
        // accumulates junk that no code reads.
        const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
        const raw = loadedSettings as unknown as Record<string, unknown>
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            const value = raw[key]
            if (value !== undefined && typeof value === typeof settings[key]) {
                settings[key] = value
            }
        }
        this.settings = settings as unknown as PluginSettings
        log('Settings loaded', 'debug', this.settings)
    }

    async saveSettings(): Promise<void> {
        log('Saving settings', 'debug', this.settings)
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
    }
}
