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
/**
 * The one function this service needs from Node's `child_process`.
 *
 * Declared here rather than taken from `typeof import('node:child_process')`,
 * which resolves to `any` wherever Node's types are not installed — including
 * Obsidian's plugin review environment, where it produced unsafe-call and
 * unsafe-member-access warnings on every use of the module. Spelling out the
 * contract keeps the call typed no matter whose type roots are present, and
 * removes a build-time dependency on `@types/node` from a plugin that must
 * also run on mobile.
 */
interface ExecFileOptions {
    cwd: string
    timeout: number
    maxBuffer: number
    encoding: 'utf-8'
}

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void

interface ChildProcessLike {
    execFile: (
        file: string,
        args: string[],
        options: ExecFileOptions,
        callback: ExecFileCallback
    ) => void
}

interface GitRepositoryContext {
    basePath: string
    args: string[]
    prefix: string
    bare: boolean
}

export class GitService {
    /**
     * Checks if git integration can work in the current environment:
     * - Must be desktop (child_process available)
     * - Must be inside a git repository
     */
    static async isAvailable(app: App): Promise<boolean> {
        return (await this.getRepositoryContext(app)) !== null
    }

    /**
     * Returns the vault's filesystem base path, or null on mobile.
     */
    static getVaultBasePath(app: App): string | null {
        if (!(app.vault.adapter instanceof FileSystemAdapter)) return null
        return app.vault.adapter.getBasePath()
    }

    private static async getRepositoryContext(app: App): Promise<GitRepositoryContext | null> {
        if (!Platform.isDesktopApp) return null

        const basePath = this.getVaultBasePath(app)
        if (!basePath) return null

        try {
            const [insideWorkTree, bare, prefix = ''] = (
                await this.exec(
                    ['rev-parse', '--is-inside-work-tree', '--is-bare-repository', '--show-prefix'],
                    basePath
                )
            ).split(/\r?\n/)

            if (insideWorkTree === 'true') return { basePath, args: [], prefix, bare: false }
            if (bare !== 'true') return null

            // A bare repository needs an explicit work tree. Let Git validate
            // the vault's .git entry; do not reinterpret a bare directory as a vault.
            await this.exec(['rev-parse', '--resolve-git-dir', '.git'], basePath)
            return { basePath, args: [`--work-tree=${basePath}`], prefix: '', bare: true }
        } catch {
            return null
        }
    }

    /**
     * Converts a vault-relative file path to a git-relative path.
     * Handles vaults that are subdirectories of a git repo.
     */
    static async getGitRelativePath(app: App, vaultFilePath: string): Promise<string | null> {
        const repository = await this.getRepositoryContext(app)
        return repository ? `${repository.prefix}${vaultFilePath}` : null
    }

    /**
     * Returns whether a file is tracked by git.
     */
    static async isFileTracked(app: App, vaultFilePath: string): Promise<boolean> {
        if (!vaultFilePath) return false
        const repository = await this.getRepositoryContext(app)
        if (!repository) return false

        try {
            // Bare repositories may have no index; committed files are still tracked.
            const command = repository.bare
                ? ['cat-file', '-e', `HEAD:${vaultFilePath}`]
                : ['ls-files', '--error-unmatch', '--', vaultFilePath]
            await this.exec([...repository.args, ...command], repository.basePath)
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
        if (!vaultFilePath) return []
        const repository = await this.getRepositoryContext(app)
        if (!repository) return []

        try {
            const output = await this.exec(
                [
                    ...repository.args,
                    'log',
                    '--follow',
                    `--format=%H%n%h%n%an%n%at%n%s`,
                    `-n`,
                    String(limit),
                    '--',
                    vaultFilePath
                ],
                repository.basePath
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
        if (!vaultFilePath) return null
        const repository = await this.getRepositoryContext(app)
        if (!repository) return null

        try {
            return await this.exec(
                [...repository.args, 'show', `${commitHash}:${repository.prefix}${vaultFilePath}`],
                repository.basePath
            )
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
     * Executes a git command and returns stdout. Loads `child_process` through
     * Electron's runtime `window.require` instead of a static/dynamic
     * `node:child_process` import: the catalog's `import/no-nodejs-modules`
     * rule flags `import('node:*')` for plugins that aren't `isDesktopOnly`,
     * and this plugin supports mobile (for the file-recovery feature). Every
     * upstream caller is already gated by `Platform.isDesktopApp`.
     */
    private static async exec(args: string[], cwd: string): Promise<string> {
        const electronRequire = (window as { require?: (id: string) => unknown }).require
        if (!electronRequire) {
            log('child_process not available', 'debug')
            throw new Error('child_process is unavailable on this platform')
        }
        const cp = electronRequire('child_process') as ChildProcessLike

        return new Promise((resolve, reject) => {
            cp.execFile(
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
        })
    }
}
