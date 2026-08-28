import { Notice, Platform, PluginSettingTab } from 'obsidian'
import type { App, SettingDefinitionItem } from 'obsidian'
import type TimeMachinePlugin from '../../main'
import { GitService } from '../services/git.service'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'
import { BUY_ME_A_COFFEE_URL, renderSupportSection } from '../ui/support-links'

/**
 * Settings tab, declared rather than rendered (Obsidian 1.13+).
 *
 * `getSettingDefinitions()` REPLACES `display()`: when it returns a non-empty
 * array, `display()` is never called. There is no partial adoption — the whole
 * settings UI is declarative, or none of it. In exchange, Obsidian owns
 * navigation, focus and ARIA, and every declared `name`/`desc` is indexed by
 * the settings search.
 *
 * Rules that each cost a shipped bug the first time they were broken
 * (see AGENTS.md "Declarative settings" for the full list):
 *
 * - A `render:` hook renders the ROW. Write into `setting.settingEl` only;
 *   anything written outside it (e.g. `group.listEl`) is the framework's to
 *   discard, and the control simply does not appear.
 * - `defaultValue` is the fallback for a RESOLVER returning undefined/null,
 *   NOT for a cleared input. Do not declare it on numeric controls; let a
 *   `validate` bounds-check refuse the cleared value inline.
 * - A row `action:` fires on the whole row, not on a button.
 * - `setControlValue` MUST reject on failure. Resolving tells the framework
 *   the write landed, so the pane keeps showing a value that was never stored.
 */
export class TimeMachineSettingTab extends PluginSettingTab {
    plugin: TimeMachinePlugin

    constructor(app: App, plugin: TimeMachinePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                type: 'group',
                heading: 'Past view',
                items: [
                    {
                        name: 'Enable past view',
                        desc: 'Read-only view of a note as it was at a chosen version, opened beside the editor. Hides its command, ribbon icon and menu items when off.',
                        control: { type: 'toggle', key: 'pastViewEnabled' }
                    },
                    {
                        name: 'Open showing changes',
                        desc: 'Show the diff rather than the old version when the past view opens',
                        control: { type: 'toggle', key: 'pastViewDefaultShowDiff' }
                    },
                    {
                        name: 'Run code in old versions',
                        desc: 'Off by default. Rendering an old version normally executes any dataviewjs and Dataview blocks it contains — against your vault as it is today, including blocks you have since deleted. While off, those blocks are shown as plain source instead.',
                        control: { type: 'toggle', key: 'pastViewExecuteBlocks' }
                    }
                ]
            },
            {
                type: 'group',
                heading: 'Git integration',
                items: [
                    {
                        name: 'Enable Git integration',
                        desc: 'Show Git commits as snapshots on the timeline (desktop only)',
                        control: { type: 'toggle', key: 'gitIntegrationEnabled' }
                    },
                    {
                        name: 'Git status',
                        desc: 'Checking Git availability...',
                        // Availability is a runtime probe, so the description is
                        // filled in asynchronously. Not a stored setting, but it
                        // stays searchable: users look for "Git status".
                        render: (setting): void => {
                            if (!Platform.isDesktopApp) {
                                setting.setDesc(
                                    'Git integration is desktop-only and is unavailable on this platform.'
                                )
                                return
                            }

                            GitService.isAvailable(this.app)
                                .then((available) => {
                                    // The pane may have been closed or
                                    // re-rendered while the probe ran; writing
                                    // into a detached row would be invisible
                                    // and would race a newer row's answer.
                                    if (!setting.settingEl.isConnected) {
                                        return
                                    }
                                    setting.setDesc(
                                        available
                                            ? 'Git repository detected. Git snapshots will appear on the timeline.'
                                            : 'Git not detected for this vault. Ensure Git is installed and the vault is inside a Git repository to see Git snapshots.'
                                    )
                                })
                                .catch(() => {
                                    if (!setting.settingEl.isConnected) {
                                        return
                                    }
                                    setting.setDesc('Could not determine Git availability.')
                                })
                        }
                    },
                    {
                        name: 'Maximum Git commits',
                        desc: 'Maximum number of Git commits to fetch per file (1-200)',
                        control: {
                            type: 'slider',
                            key: 'gitMaxCommits',
                            min: 1,
                            max: 200,
                            step: 1
                            // No defaultValue on purpose: it is the fallback for
                            // a resolver returning nothing, not for a cleared
                            // input, and the resolver here always answers.
                        }
                    }
                ]
            },
            {
                name: 'Follow me on X',
                desc: 'Sébastien Dubois (@dSebastien)',
                searchable: false,
                // A CTA button, not a row `action:`. `action:` makes the WHOLE
                // row clickable and draws no button — the old tab had a real
                // "Follow me on X" button, and the docs describe one.
                render: (setting): void => {
                    setting.addButton((button) => {
                        button
                            .setCta()
                            .setButtonText('Follow me on X')
                            .onClick(() => {
                                window.open('https://x.com/dSebastien')
                            })
                    })
                }
            },
            {
                type: 'group',
                // No heading: renderSupportSection draws its own.
                items: [
                    {
                        name: 'Support',
                        // Not a setting — keep it out of the settings search.
                        searchable: false,
                        render: (setting): void => {
                            // Render INSIDE the row (settingEl), never into
                            // group.listEl — see the class docs above.
                            setting.infoEl.remove() // the section draws its own headings
                            // `.setting-item` is a flex ROW. The support block
                            // is a stack of full-width rows, so without this it
                            // would lay its heading, buttons and badge out
                            // side by side instead of one per line.
                            setting.settingEl.addClass('tm-settings-stack')
                            renderSupportSection(setting.settingEl, (el) => {
                                this.renderBuyMeACoffeeBadge(el)
                            })
                        }
                    }
                ]
            }
        ]
    }

    /**
     * Reads the value behind a control `key`. Returning undefined/null makes
     * the framework fall back to the control's declared `defaultValue`.
     */
    override getControlValue(key: string): unknown {
        switch (key) {
            case 'pastViewEnabled':
                return this.plugin.settings.pastViewEnabled
            case 'pastViewDefaultShowDiff':
                return this.plugin.settings.pastViewDefaultShowDiff
            case 'pastViewExecuteBlocks':
                return this.plugin.settings.pastViewExecuteBlocks
            case 'gitIntegrationEnabled':
                return this.plugin.settings.gitIntegrationEnabled
            case 'gitMaxCommits':
                return this.plugin.settings.gitMaxCommits
            default:
                return undefined
        }
    }

    /**
     * Persists a control edit. Rejecting (not resolving) on failure is what
     * lets the framework roll the control back to the stored truth.
     *
     * Side effects run only AFTER the write lands: acting on a value that was
     * never persisted would leave the UI and the stored settings disagreeing.
     */
    override async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
            case 'pastViewEnabled': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.pastViewEnabled = next
                })
                this.plugin.syncPastViewRibbon()
                return
            }
            case 'pastViewDefaultShowDiff': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.pastViewDefaultShowDiff = next
                })
                return
            }
            case 'pastViewExecuteBlocks': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.pastViewExecuteBlocks = next
                })
                // Turning this off must unload code that is already running in
                // an open past view, not just affect the next render.
                this.plugin.refreshAllViews()
                return
            }
            case 'gitIntegrationEnabled': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.gitIntegrationEnabled = next
                })
                return
            }
            case 'gitMaxCommits': {
                if (typeof value !== 'number' || !Number.isInteger(value)) {
                    throw new Error(`Setting "${key}" expects a whole number.`)
                }
                if (value < 1 || value > 200) {
                    throw new Error(`Setting "${key}" expects a value between 1 and 200.`)
                }
                await this.plugin.updateSettings((draft) => {
                    draft.gitMaxCommits = value
                })
                return
            }
            default:
                new Notice('Failed to save settings.')
                throw new Error(`Setting "${key}" does not address a known field.`)
        }
    }

    /** Rejects rather than coerces: a bad value must not reach the store. */
    private expectBoolean(key: string, value: unknown): boolean {
        if (typeof value !== 'boolean') {
            throw new Error(`Setting "${key}" expects a boolean.`)
        }
        return value
    }

    renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: BUY_ME_A_COFFEE_URL
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src = BUY_ME_A_COFFEE_BADGE_DATA_URL
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
