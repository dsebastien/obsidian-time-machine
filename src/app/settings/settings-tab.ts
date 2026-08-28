import { type App, Platform, PluginSettingTab, Setting } from 'obsidian'
import type TimeMachinePlugin from '../../main'
import { GitService } from '../services/git.service'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'
import { renderSupportSection } from '../ui/support-links'

export class TimeMachineSettingTab extends PluginSettingTab {
    plugin: TimeMachinePlugin

    constructor(app: App, plugin: TimeMachinePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        this.renderPastViewSettings(containerEl)
        this.renderGitSettings(containerEl)
        this.renderFollowButton(containerEl)
        this.renderSupportHeader(containerEl)
    }

    renderPastViewSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Past view').setHeading()

        new Setting(containerEl)
            .setName('Enable past view')
            .setDesc(
                'Read-only view of a note as it was at a chosen version, opened beside the editor. Hides its command, ribbon icon and menu items when off.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.pastViewEnabled).onChange(async (value) => {
                    this.plugin.settings.pastViewEnabled = value
                    await this.plugin.saveSettings()
                    this.plugin.syncPastViewRibbon()
                })
            })

        new Setting(containerEl)
            .setName('Open showing changes')
            .setDesc('Show the diff rather than the old version when the past view opens')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.pastViewDefaultShowDiff)
                    .onChange(async (value) => {
                        this.plugin.settings.pastViewDefaultShowDiff = value
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName('Run code in old versions')
            .setDesc(
                'Off by default. Rendering an old version normally executes any dataviewjs and Dataview blocks it contains — against your vault as it is today, including blocks you have since deleted. While off, those blocks are shown as plain source instead.'
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.pastViewExecuteBlocks)
                    .onChange(async (value) => {
                        this.plugin.settings.pastViewExecuteBlocks = value
                        await this.plugin.saveSettings()
                        // Turning this off must unload code that is already
                        // running in an open past view, not just affect the next
                        // render.
                        this.plugin.refreshAllViews()
                    })
            })
    }

    renderGitSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Git integration').setHeading()

        new Setting(containerEl)
            .setName('Enable Git integration')
            .setDesc('Show Git commits as snapshots on the timeline (desktop only)')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.gitIntegrationEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.gitIntegrationEnabled = value
                        await this.plugin.saveSettings()
                    })
            })

        this.renderGitStatus(containerEl)

        new Setting(containerEl)
            .setName('Maximum Git commits')
            .setDesc('Maximum number of Git commits to fetch per file (1-200)')
            .addSlider((slider) => {
                slider
                    .setLimits(1, 200, 1)
                    .setValue(this.plugin.settings.gitMaxCommits)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.gitMaxCommits = value
                        await this.plugin.saveSettings()
                    })
            })
    }

    renderGitStatus(containerEl: HTMLElement): void {
        const statusSetting = new Setting(containerEl)
            .setName('Git status')
            .setDesc('Checking Git availability...')

        if (!Platform.isDesktopApp) {
            statusSetting.setDesc(
                'Git integration is desktop-only and is unavailable on this platform.'
            )
            return
        }

        GitService.isAvailable(this.app)
            .then((available) => {
                if (available) {
                    statusSetting.setDesc(
                        'Git repository detected. Git snapshots will appear on the timeline.'
                    )
                } else {
                    statusSetting.setDesc(
                        'Git not detected for this vault. Ensure Git is installed and the vault is inside a Git repository to see Git snapshots.'
                    )
                }
            })
            .catch(() => {
                statusSetting.setDesc('Could not determine Git availability.')
            })
    }

    renderFollowButton(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Follow me on X')
            .setDesc('Sébastien Dubois (@dSebastien)')
            .addButton((button) => {
                button.setCta()
                button.setButtonText('Follow me on X').onClick(() => {
                    window.open('https://x.com/dSebastien')
                })
            })
    }

    renderSupportHeader(containerEl: HTMLElement): void {
        renderSupportSection(containerEl, (el) => {
            this.renderBuyMeACoffeeBadge(el)
        })
    }

    renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: 'https://www.buymeacoffee.com/dsebastien'
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src = BUY_ME_A_COFFEE_BADGE_DATA_URL
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
