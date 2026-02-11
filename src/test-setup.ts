/**
 * Test setup file that mocks the 'obsidian' module.
 * The obsidian package is types-only and has no runtime code,
 * so we need to provide mock implementations for tests.
 */
import { mock } from 'bun:test'

// Mock the obsidian module (fire-and-forget, no need to await)
void mock.module('obsidian', () => ({
    Notice: class Notice {
        constructor(_message: string, _timeout?: number) {
            // No-op for tests
        }
    },
    App: class App {},
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
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
    setIcon: () => {}
}))
