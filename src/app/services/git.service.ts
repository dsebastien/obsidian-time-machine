import { type App, FileSystemAdapter, Platform } from 'obsidian'
import { log } from '../../utils/log'

const GIT_TIMEOUT_MS = 10_000
const GIT_MAX_BUFFER = 10 * 1024 * 1024 // 10 MB

export interface GitCommitInfo {
    hash: string
    shortHash: string
    authorName: string
    /** Unix timestamp in seconds */
    authorDateUnix: number
    subject: string
}

/**
 * Desktop-only git operations. All methods are static and fail gracefully
 * (returning empty/null) when git is not available or commands fail.
 */
export class GitService {
    /**
     * Checks if git integration can work in the current environment:
     * - Must be desktop (child_process available)
     * - Must be inside a git repository
     */
    static async isAvailable(app: App): Promise<boolean> {
        if (!Platform.isDesktopApp) return false

        const basePath = this.getVaultBasePath(app)
        if (!basePath) return false

        try {
            const result = await this.exec(['rev-parse', '--is-inside-work-tree'], basePath)
            return result.trim() === 'true'
        } catch {
            return false
        }
    }

    /**
     * Returns the vault's filesystem base path, or null on mobile.
     */
    static getVaultBasePath(app: App): string | null {
        if (!(app.vault.adapter instanceof FileSystemAdapter)) return null
        return app.vault.adapter.getBasePath()
    }

    /**
     * Converts a vault-relative file path to a git-relative path.
     * Handles vaults that are subdirectories of a git repo.
     */
    static async getGitRelativePath(app: App, vaultFilePath: string): Promise<string | null> {
        const basePath = this.getVaultBasePath(app)
        if (!basePath) return null

        try {
            const topLevel = (await this.exec(['rev-parse', '--show-toplevel'], basePath)).trim()

            // If vault root IS the repo root, vault-relative = git-relative
            if (this.normalizePath(basePath) === this.normalizePath(topLevel)) {
                return vaultFilePath
            }

            // Vault is a subdirectory of the repo
            const relative = this.normalizePath(basePath).slice(
                this.normalizePath(topLevel).length + 1
            )
            return relative ? `${relative}/${vaultFilePath}` : vaultFilePath
        } catch {
            return null
        }
    }

    /**
     * Returns whether a file is tracked by git.
     */
    static async isFileTracked(app: App, vaultFilePath: string): Promise<boolean> {
        const basePath = this.getVaultBasePath(app)
        if (!basePath) return false

        const gitPath = await this.getGitRelativePath(app, vaultFilePath)
        if (!gitPath) return false

        try {
            await this.exec(['ls-files', '--error-unmatch', '--', gitPath], basePath)
            return true
        } catch {
            return false
        }
    }

    /**
     * Fetches commit history for a file.
     * Uses --follow to track renames.
     */
    static async getCommitsForFile(
        app: App,
        vaultFilePath: string,
        limit: number
    ): Promise<GitCommitInfo[]> {
        const basePath = this.getVaultBasePath(app)
        if (!basePath) return []

        const gitPath = await this.getGitRelativePath(app, vaultFilePath)
        if (!gitPath) return []

        try {
            const output = await this.exec(
                [
                    'log',
                    '--follow',
                    `--format=%H%n%h%n%an%n%at%n%s`,
                    `-n`,
                    String(limit),
                    '--',
                    gitPath
                ],
                basePath
            )

            return this.parseCommitLog(output)
        } catch {
            return []
        }
    }

    /**
     * Retrieves file content at a specific commit.
     * Returns null if the file didn't exist at that commit.
     */
    static async getFileAtCommit(
        app: App,
        commitHash: string,
        vaultFilePath: string
    ): Promise<string | null> {
        const basePath = this.getVaultBasePath(app)
        if (!basePath) return null

        const gitPath = await this.getGitRelativePath(app, vaultFilePath)
        if (!gitPath) return null

        try {
            return await this.exec(['show', `${commitHash}:${gitPath}`], basePath)
        } catch {
            return null
        }
    }

    /**
     * Parses the output of `git log --format=%H%n%h%n%an%n%at%n%s`.
     * Each commit produces 5 lines: hash, shortHash, authorName, authorDateUnix, subject.
     */
    private static parseCommitLog(output: string): GitCommitInfo[] {
        const lines = output.trim().split('\n')
        const commits: GitCommitInfo[] = []
        const FIELDS_PER_COMMIT = 5

        for (let i = 0; i + FIELDS_PER_COMMIT <= lines.length; i += FIELDS_PER_COMMIT) {
            const hash = lines[i]
            const shortHash = lines[i + 1]
            const authorName = lines[i + 2]
            const authorDateStr = lines[i + 3]
            const subject = lines[i + 4]

            if (!hash || !shortHash || !authorName || !authorDateStr || !subject) continue

            const authorDateUnix = parseInt(authorDateStr, 10)
            if (isNaN(authorDateUnix)) continue

            commits.push({ hash, shortHash, authorName, authorDateUnix, subject })
        }

        return commits
    }

    /**
     * Executes a git command and returns stdout.
     * Uses dynamic require to avoid bundling issues on mobile.
     */
    private static exec(args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // Dynamic require to avoid bundling child_process on mobile
                // eslint-disable-next-line import/no-nodejs-modules
                const { execFile } = require('child_process') as typeof import('child_process')

                execFile(
                    'git',
                    args,
                    {
                        cwd,
                        timeout: GIT_TIMEOUT_MS,
                        maxBuffer: GIT_MAX_BUFFER,
                        encoding: 'utf-8'
                    },
                    (error: Error | null, stdout: string, stderr: string) => {
                        if (error) {
                            log(`git ${args[0]} failed: ${stderr || error.message}`, 'debug')
                            reject(error)
                            return
                        }
                        resolve(stdout)
                    }
                )
            } catch (error) {
                log('child_process not available', 'debug')
                reject(error instanceof Error ? error : new Error(String(error)))
            }
        })
    }

    private static normalizePath(p: string): string {
        return p.replace(/\\/g, '/').replace(/\/+$/, '')
    }
}
