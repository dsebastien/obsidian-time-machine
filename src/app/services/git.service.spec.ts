import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { $ } from 'bun'
import { App, FileSystemAdapter, Platform } from 'obsidian'
import { GitService } from './git.service'

function join(...parts: string[]): string {
    return parts.join(process.platform === 'win32' ? '\\' : '/')
}

function createMockApp(): App {
    return Object.assign(new App(), { vault: { adapter: {} } })
}

function createDesktopApp(basePath: string): App {
    const adapter = new FileSystemAdapter()
    adapter.getBasePath = () => basePath
    return Object.assign(new App(), { vault: { adapter } })
}

const fixturePaths: string[] = []

async function createFixture(): Promise<string> {
    const path = join(
        process.getBuiltinModule('node:os').tmpdir(),
        `.git-service-fixture-${crypto.randomUUID()}`
    )
    await $`mkdir -p ${path}`.quiet()
    fixturePaths.push(path)
    return path
}

function git(cwd: string, ...args: string[]): string {
    const result = Bun.spawnSync(
        [
            'git',
            '-c',
            'user.name=History fixture',
            '-c',
            'user.email=fixture@example.invalid',
            '-c',
            'commit.gpgsign=false',
            ...args
        ],
        { cwd, timeout: 10_000, stdout: 'pipe', stderr: 'pipe' }
    )
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    return result.stdout.toString()
}

async function recordVersion(
    root: string,
    filePath: string,
    content: string,
    subject: string
): Promise<string> {
    await Bun.write(join(root, filePath), content)
    git(root, `--work-tree=${root}`, 'add', '--', filePath)
    git(root, `--work-tree=${root}`, 'commit', '--quiet', '-m', subject)
    return git(root, 'rev-parse', 'HEAD').trim()
}

describe('GitService', () => {
    let originalWindow: PropertyDescriptor | undefined
    let wasDesktop: boolean

    beforeEach(() => {
        originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
        wasDesktop = Platform.isDesktopApp
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { require }
        })
        Platform.isDesktopApp = true
    })

    afterEach(async () => {
        Platform.isDesktopApp = wasDesktop
        if (originalWindow) {
            Object.defineProperty(globalThis, 'window', originalWindow)
        } else {
            Reflect.deleteProperty(globalThis, 'window')
        }
        for (const path of fixturePaths.splice(0)) {
            await $`rm -rf ${path}`.quiet()
        }
    }, 30_000)

    describe('getVaultBasePath', () => {
        test('returns null when adapter is not FileSystemAdapter', () => {
            const result = GitService.getVaultBasePath(createMockApp())
            expect(result).toBeNull()
        })
    })

    describe('isAvailable', () => {
        test('returns false when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.isAvailable(createMockApp())
            expect(result).toBe(false)
        })
    })

    describe('getCommitsForFile', () => {
        test('returns empty array when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.getCommitsForFile(createMockApp(), 'test.md', 10)
            expect(result).toEqual([])
        })
    })

    describe('getFileAtCommit', () => {
        test('returns null when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.getFileAtCommit(createMockApp(), 'abc123', 'test.md')
            expect(result).toBeNull()
        })
    })

    describe('isFileTracked', () => {
        test('returns false when adapter is not FileSystemAdapter', async () => {
            const result = await GitService.isFileTracked(createMockApp(), 'test.md')
            expect(result).toBe(false)
        })
    })

    test.each(['invalid pointer', 'bare directory', 'mobile', 'no runtime'])(
        'degrades gracefully: %s',
        async (scenario) => {
            const fixture = await createFixture()
            let runtimeLoads = 0
            if (scenario === 'invalid pointer') {
                await Bun.write(join(fixture, '.git'), 'gitdir: missing-repository\n')
            } else if (scenario === 'bare directory') {
                git(fixture, 'init', '--quiet', '--bare')
            } else if (scenario === 'mobile') {
                Platform.isDesktopApp = false
                Object.defineProperty(globalThis, 'window', {
                    configurable: true,
                    get: () => {
                        runtimeLoads++
                        throw new Error('Mobile must not load the desktop runtime')
                    }
                })
            } else {
                Object.defineProperty(globalThis, 'window', {
                    configurable: true,
                    value: {}
                })
            }

            const app = createDesktopApp(fixture)
            expect(await GitService.isAvailable(app)).toBe(false)
            expect(await GitService.getGitRelativePath(app, 'note.md')).toBeNull()
            expect(await GitService.isFileTracked(app, 'note.md')).toBe(false)
            expect(await GitService.getCommitsForFile(app, 'note.md', 10)).toEqual([])
            expect(await GitService.getFileAtCommit(app, 'HEAD', 'note.md')).toBeNull()
            expect(runtimeLoads).toBe(0)
        },
        30_000
    )

    describe('real Git repositories', () => {
        const layouts = [
            'ordinary',
            'nested vault',
            'separate git directory',
            'linked worktree',
            'absolute bare pointer',
            'relative bare pointer'
        ]

        test.each(layouts)(
            'reads history without writes: %s',
            async (layout) => {
                const fixture = await createFixture()
                const root = join(fixture, 'Obsidian')
                await $`mkdir -p ${root}`.quiet()
                let vault = root
                let repository = root
                let filePath = 'note.md'
                let expectedGitPath = filePath

                if (layout === 'absolute bare pointer' || layout === 'relative bare pointer') {
                    vault = join(root, 'Obsidian-Vault')
                    repository = vault
                    await $`mkdir -p ${vault}`.quiet()
                    const bare = join(root, 'Vault.git')
                    git(root, 'init', '--quiet', '--bare', bare)
                    const pointer = layout === 'absolute bare pointer' ? bare : '../Vault.git'
                    await Bun.write(join(vault, '.git'), `gitdir: ${pointer}\n`)
                    expect(git(vault, 'rev-parse', '--is-bare-repository').trim()).toBe('true')
                    expect(() => git(vault, 'rev-parse', '--show-toplevel')).toThrow()
                } else if (layout === 'separate git directory') {
                    vault = join(root, 'Obsidian-Vault')
                    repository = vault
                    git(
                        root,
                        'init',
                        '--quiet',
                        `--separate-git-dir=${join(root, 'Vault.git')}`,
                        vault
                    )
                } else {
                    git(root, 'init', '--quiet')
                }

                git(repository, 'config', 'core.autocrlf', 'false')
                if (layout === 'nested vault') {
                    vault = join(root, 'Obsidian-Vault')
                    await $`mkdir -p ${vault}`.quiet()
                    expectedGitPath = 'Obsidian-Vault/note.md'
                    filePath = expectedGitPath
                }

                const firstHash = await recordVersion(
                    repository,
                    filePath,
                    'first\n',
                    'First version'
                )
                let latestHash = await recordVersion(
                    repository,
                    filePath,
                    'second\n',
                    'Second version'
                )

                if (layout === 'linked worktree') {
                    vault = join(fixture, 'Linked Vault')
                    git(root, 'worktree', 'add', '--quiet', '--detach', vault)
                    latestHash = await recordVersion(vault, filePath, 'linked\n', 'Linked version')
                }

                const app = createDesktopApp(vault)
                const gitDirectory = git(vault, 'rev-parse', '--absolute-git-dir').trim()
                const configPath = join(
                    git(vault, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
                    'config'
                )
                const indexPath = join(gitDirectory, 'index')
                if (layout === 'relative bare pointer') await Bun.file(indexPath).delete()
                const headBefore = await Bun.file(join(gitDirectory, 'HEAD')).bytes()
                const indexBefore = (await Bun.file(indexPath).exists())
                    ? await Bun.file(indexPath).bytes()
                    : null
                const configBefore = await Bun.file(configPath).bytes()
                const noteBefore = await Bun.file(join(vault, 'note.md')).bytes()

                expect(GitService.getVaultBasePath(app)).toBe(vault)
                expect(await GitService.isAvailable(app)).toBe(true)
                expect(await GitService.getGitRelativePath(app, 'note.md')).toBe(expectedGitPath)
                expect(await GitService.isFileTracked(app, 'note.md')).toBe(true)
                const commits = await GitService.getCommitsForFile(app, 'note.md', 10)
                expect(commits.map((commit) => commit.hash)).toEqual(
                    layout === 'linked worktree'
                        ? [latestHash, git(root, 'rev-parse', 'HEAD').trim(), firstHash]
                        : [latestHash, firstHash]
                )
                expect(commits[0]?.authorName).toBe('History fixture')
                expect(await GitService.getCommitsForFile(app, 'note.md', 1)).toHaveLength(1)
                expect(await GitService.getFileAtCommit(app, firstHash, 'note.md')).toBe('first\n')
                expect(await GitService.getFileAtCommit(app, latestHash, 'note.md')).toBe(
                    layout === 'linked worktree' ? 'linked\n' : 'second\n'
                )
                expect(await GitService.isFileTracked(app, 'untracked.md')).toBe(false)
                expect(await GitService.getCommitsForFile(app, 'untracked.md', 10)).toEqual([])
                expect(await GitService.getFileAtCommit(app, firstHash, 'untracked.md')).toBeNull()
                expect(await GitService.getFileAtCommit(app, 'missing-ref', 'note.md')).toBeNull()
                expect(await GitService.isFileTracked(app, '')).toBe(false)
                expect(await GitService.getCommitsForFile(app, '', 10)).toEqual([])
                expect(await GitService.getFileAtCommit(app, firstHash, '')).toBeNull()
                expect(await Bun.file(join(gitDirectory, 'HEAD')).bytes()).toEqual(headBefore)
                expect(
                    (await Bun.file(indexPath).exists()) ? await Bun.file(indexPath).bytes() : null
                ).toEqual(indexBefore)
                expect(await Bun.file(configPath).bytes()).toEqual(configBefore)
                expect(await Bun.file(join(vault, 'note.md')).bytes()).toEqual(noteBefore)
                expect(git(vault, 'rev-parse', 'HEAD').trim()).toBe(latestHash)
            },
            120_000
        )
    })
})
