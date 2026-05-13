import { type App, Platform, PluginSettingTab, Setting } from 'obsidian'
import type TimeMachinePlugin from '../../main'
import { GitService } from '../services/git.service'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'

export class TimeMachineSettingTab extends PluginSettingTab {
    plugin: TimeMachinePlugin

    constructor(app: App, plugin: TimeMachinePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        this.renderGitSettings(containerEl)
        this.renderFollowButton(containerEl)
        this.renderSupportHeader(containerEl)
    }

    renderGitSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Git integration').setHeading()

        new Setting(containerEl)
            .setName('Enable git integration')
            .setDesc('Show git commits as snapshots on the timeline (desktop only)')
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
            .setName('Maximum git commits')
            .setDesc('Maximum number of git commits to fetch per file (1-200)')
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
            .setDesc('Checking git availability...')

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
                        'Git not detected for this vault. Ensure git is installed and the vault is inside a git repository to see git snapshots.'
                    )
                }
            })
            .catch(() => {
                statusSetting.setDesc('Could not determine git availability.')
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
        new Setting(containerEl).setName('Support').setHeading()

        const supportDesc = new DocumentFragment()
        supportDesc.createDiv({
            text: 'Buy me a coffee to support the development of this plugin'
        })

        new Setting(containerEl).setDesc(supportDesc)

        this.renderBuyMeACoffeeBadge(containerEl)
        const spacing = containerEl.createDiv()
        spacing.classList.add('support-header-margin')
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
