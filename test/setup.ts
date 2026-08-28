/**
 * Test setup file that mocks the 'obsidian' module.
 * The obsidian package is types-only and has no runtime code,
 * so we need to provide mock implementations for tests.
 */
import { mock } from 'bun:test'

/**
 * `mock.module` typed explicitly.
 *
 * Without Bun's ambient types the import resolves to `any`, and every use of it
 * reported unsafe-call and unsafe-member-access in Obsidian's plugin review.
 * Naming the contract keeps the call site typed wherever it is linted.
 */
// Wrapped rather than detached: pulling `mock.module` off its object and
// storing it loses the `this` binding, which ESLint rightly objects to.
const mockModule = (id: string, factory: () => unknown): void => {
    void (mock.module as (id: string, factory: () => unknown) => unknown)(id, factory)
}

// Mock the obsidian module (fire-and-forget, no need to await)
mockModule('obsidian', () => ({
    Notice: class Notice {
        constructor(_message: string, _timeout?: number) {
            // No-op for tests
        }
    },
    App: class App {},
    Component: class Component {
        load() {}
        unload() {}
        addChild<T>(child: T): T {
            return child
        }
        removeChild<T>(child: T): T {
            return child
        }
        register(_cb: () => void) {}
    },
    Menu: class Menu {
        addItem(cb: (item: unknown) => void) {
            const item = {
                setTitle: () => item,
                setIcon: () => item,
                setDisabled: () => item,
                onClick: () => item
            }
            cb(item)
            return this
        }
        showAtMouseEvent() {
            return this
        }
    },
    MarkdownRenderer: {
        render: () => Promise.resolve()
    },
    TFile: class TFile {},
    Plugin: class Plugin {},
    PluginSettingTab: class PluginSettingTab {},
    Setting: class Setting {},
    MarkdownView: class MarkdownView {},
    TAbstractFile: class TAbstractFile {},
    TFolder: class TFolder {},
    AbstractInputSuggest: class AbstractInputSuggest {},
    SearchComponent: class SearchComponent {},
    ItemView: class ItemView {
        containerEl = { children: [null, { empty: () => {} }] }
        app = {}
        constructor() {}
        getViewType() {
            return ''
        }
        getDisplayText() {
            return ''
        }
    },
    Modal: class Modal {
        app: unknown
        contentEl = { empty: () => {}, createEl: () => ({}) }
        constructor(app: unknown) {
            this.app = app
        }
        open() {}
        close() {}
    },
    WorkspaceLeaf: class WorkspaceLeaf {},
    FileSystemAdapter: class FileSystemAdapter {
        getBasePath() {
            return ''
        }
    },
    Platform: {
        isDesktopApp: false,
        isMobile: true,
        isMobileApp: true,
        isIosApp: false,
        isAndroidApp: false
    },
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
    setIcon: () => {}
}))
