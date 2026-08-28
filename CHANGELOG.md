# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.5.2...2.0.0) (2026-08-28)

### ⚠ BREAKING CHANGES

* **plugin:** requires Obsidian 1.13.0 (minAppVersion bumped from 1.8.7).

`getSettingDefinitions()` replaces `display()` — it is all-or-nothing, so the
whole pane is now declarative. Obsidian owns navigation, focus and ARIA, and
every name/desc is indexed by the settings search.

The write path changed with it. The tab used to mutate `plugin.settings` and
then call `saveSettings()`, so a failed write left memory ahead of disk and the
control showing a value that was never stored. All edits now go through a
serialized, persist-then-commit `updateSettings`: memory is swapped only after
saveData() resolves, and writes queue so each mutation derives from the
previous committed state.

That matters more here than elsewhere because this plugin has two writers.
`setComparisonMode` — driven by the in-panel toggle, one click away from a pane
edit — also routes through `updateSettings` now; before, the two could interleave
and the second commit would drop the first edit.

Preserved from the old tab: the ribbon sync on "Enable past view", and the view
refresh on "Run code in old versions" (which must unload code already running in
an open past view, not just affect the next render). Both now run only after the
write lands. The async Git-availability probe re-checks that its row is still
connected before writing, since the pane can close while it runs.

Also ports the template's settings guard spec, which fails the two render-hook
patterns that no test can otherwise catch, and documents the traps in AGENTS.md.

### Features

* **plugin:** declare settings via getSettingDefinitions (Obsidian 1.13) ([0f5974d](https://github.com/dsebastien/obsidian-time-machine/commit/0f5974dfeda3bcba2accd1460806666b0f5d98ad))

### Bug Fixes

* **build:** align with the catalog reviewer's archive, ruleset and audit ([f932f13](https://github.com/dsebastien/obsidian-time-machine/commit/f932f133211ee1973e6ff4c373269427ad57fbad))
* **plugin:** restore the follow button and stack the support block ([1bf87f5](https://github.com/dsebastien/obsidian-time-machine/commit/1bf87f5bbeff8898bcb68abf0f70b29b71d50c94))
* **ui:** move the settings-stack rule out of the components layer ([d5a19dd](https://github.com/dsebastien/obsidian-time-machine/commit/d5a19ddec4dd131fae4277c6713579841d31f33c))

## [1.5.2](https://github.com/dsebastien/obsidian-time-machine/compare/1.5.1...1.5.2) (2026-08-28)

### Bug Fixes

* **plugin:** remove the remaining unsafe-any warnings from the review ([f24cc03](https://github.com/dsebastien/obsidian-time-machine/commit/f24cc036358e06d4f4436c3af08df556b056b592))

## [1.5.1](https://github.com/dsebastien/obsidian-time-machine/compare/1.5.0...1.5.1) (2026-08-28)

### Bug Fixes

* **plugin:** satisfy the Obsidian plugin review checks ([e79233f](https://github.com/dsebastien/obsidian-time-machine/commit/e79233f92670be565adc91ccd8f4d53d23a56436))

## [1.5.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.4.0...1.5.0) (2026-08-27)

### Features

* **plugin:** add the past view (issue [#9](https://github.com/dsebastien/obsidian-time-machine/issues/9)) ([2fe2241](https://github.com/dsebastien/obsidian-time-machine/commit/2fe22418bddb35c9ce5b390de1a5d7d2aaa93c88))
* **plugin:** neutralise executable blocks before rendering old versions ([905a277](https://github.com/dsebastien/obsidian-time-machine/commit/905a277e4249db7e7f3b155d5b287b25746b547b)), closes [#9](https://github.com/dsebastien/obsidian-time-machine/issues/9)
* **plugin:** refine the version rail ([fb5cf3b](https://github.com/dsebastien/obsidian-time-machine/commit/fb5cf3b5817895a3d6500d346ed3c00141506229))
* **plugin:** replace the timeline with a version rail ([57c32fd](https://github.com/dsebastien/obsidian-time-machine/commit/57c32fde28077a8d37996de77f435b25ba2c5878))

### Bug Fixes

* **plugin:** address the adversarial review of the past view ([76f4c3f](https://github.com/dsebastien/obsidian-time-machine/commit/76f4c3fab682b0e9585b413b325535bead0e6c12))
* **plugin:** close three neutralisation bypasses and split the async guards ([775c5de](https://github.com/dsebastien/obsidian-time-machine/commit/775c5de2613cf27b106b33016a6e143c0b9ea440))
* **plugin:** discard stale async results and guard hunk restore ([d55c353](https://github.com/dsebastien/obsidian-time-machine/commit/d55c35369f1100ac4709b53acf3d282ea9e9a8e3)), closes [#9](https://github.com/dsebastien/obsidian-time-machine/issues/9)
* **plugin:** follow the active note and stop pinning the tab ([cd55ae4](https://github.com/dsebastien/obsidian-time-machine/commit/cd55ae47c3af752578c41c58e32155bcd1643459))
* **plugin:** keep every version reachable in a large history ([28b55ce](https://github.com/dsebastien/obsidian-time-machine/commit/28b55ced2f0e1ac0dd3288a3b20d8f5e8d55b84c))
* **plugin:** separate the comparison mode options ([771685a](https://github.com/dsebastien/obsidian-time-machine/commit/771685a420c1b492ef1530cc6feb24fa1a9f8599))
* **plugin:** truncate long filenames instead of overflowing the header ([33316f6](https://github.com/dsebastien/obsidian-time-machine/commit/33316f6355c9b9dcb1959f9b636465af7ca57486))

## [1.4.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.3.0...1.4.0) (2026-08-19)

### Features

* **plugin:** add a version-to-version diff comparison mode ([eab80b5](https://github.com/dsebastien/obsidian-time-machine/commit/eab80b54ce4c6f63e7b0923bcf131511860e874d)), closes [#8](https://github.com/dsebastien/obsidian-time-machine/issues/8)
* **plugin:** show what's new in a tab instead of a modal dialog ([aa43202](https://github.com/dsebastien/obsidian-time-machine/commit/aa43202d35cea72928ea31bf0cd0c89fa0ffd409))
* **plugin:** surface support CTAs everywhere users can see them ([23795bd](https://github.com/dsebastien/obsidian-time-machine/commit/23795bd017dc62fca5099427960345777b9e9b46))

### Bug Fixes

* **plugin:** stop cursor-following from resolving files via getActiveFile ([38473eb](https://github.com/dsebastien/obsidian-time-machine/commit/38473eb66117aba159c994e1cc1444b227582698)), closes [#7](https://github.com/dsebastien/obsidian-time-machine/issues/7)

## [1.3.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.2.0...1.3.0) (2026-07-29)

### Features

* **plugin:** aggregate what's new dialogs across simultaneously updated plugins ([d3b245b](https://github.com/dsebastien/obsidian-time-machine/commit/d3b245b63e6feea35dfcbdfebd3fcc300b545ced))

## [1.2.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.1.0...1.2.0) (2026-07-29)

### Features

* **plugin:** add Knowii community to the what's new dialog and harden it ([54d94de](https://github.com/dsebastien/obsidian-time-machine/commit/54d94ded5adeadd1b8e830212c13ed0ce4284ea5))

## [1.1.0](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.8...1.1.0) (2026-07-27)

### Features

* **plugin:** show a what's new dialog once after plugin updates ([f624b27](https://github.com/dsebastien/obsidian-time-machine/commit/f624b27406bd1d7526c2892b958ad687685d802a))

## [1.0.8](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.7...1.0.8) (2026-07-17)

## [1.0.7](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.6...1.0.7) (2026-07-13)

### Bug Fixes

* **plugin:** keep view fixed while interacting with the slider ([a91f741](https://github.com/dsebastien/obsidian-time-machine/commit/a91f7410913b10f5370a2cc6d03a5558ba582549))

## [1.0.6](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.5...1.0.6) (2026-06-17)

### Bug Fixes

* **plugin:** follow text cursor so continuous-scroll views track the right file ([d4a39c6](https://github.com/dsebastien/obsidian-time-machine/commit/d4a39c6b52a04b2d4cd34b013a6921a68bfaa891)), closes [#7](https://github.com/dsebastien/obsidian-time-machine/issues/7)

## [1.0.5](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.4...1.0.5) (2026-06-09)

## [1.0.4](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.3...1.0.4) (2026-06-09)

### Bug Fixes

* **all:** fixed issue with diffs and improved rendering ([3759b44](https://github.com/dsebastien/obsidian-time-machine/commit/3759b44e2bb2549a5c77b663e87eaa3530c8ce3e))

## [1.0.3](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.2...1.0.3) (2026-05-18)

### Bug Fixes

* **all:** work around conflict with Pane-Relief plugin ([155c4c8](https://github.com/dsebastien/obsidian-time-machine/commit/155c4c84fc9d8f3d9751b3ae5b6fbb2587d819a6)), closes [#5](https://github.com/dsebastien/obsidian-time-machine/issues/5)

## [1.0.2](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.1...1.0.2) (2026-05-15)

## [1.0.1](https://github.com/dsebastien/obsidian-time-machine/compare/1.0.0...1.0.1) (2026-05-14)

## [1.0.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.6.0...1.0.0) (2026-05-13)

## [0.6.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.5.2...0.6.0) (2026-04-22)

### Features

* **all:** warn if git is not available or if not in a git repository but the git integration is enabled ([9747a5a](https://github.com/dsebastien/obsidian-time-machine/commit/9747a5aab93684d7b60d829b5225f42d0ecc0470))

## [0.5.2](https://github.com/dsebastien/obsidian-time-machine/compare/0.5.1...0.5.2) (2026-03-01)

### Bug Fixes

* **all:** fixed error with uninitialized iew ([bc136bd](https://github.com/dsebastien/obsidian-time-machine/commit/bc136bd91ed975ccdd4997508a3bc1834a3cb633))

## [0.5.1](https://github.com/dsebastien/obsidian-time-machine/compare/0.5.0...0.5.1) (2026-02-21)

### Bug Fixes

* **all:** fixed bug ([498818c](https://github.com/dsebastien/obsidian-time-machine/commit/498818c5c362c67257df7fcb91b3235d720e3382))

## [0.5.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.4.0...0.5.0) (2026-02-13)

### Features

* **all:** made the diffs selectable ([5f620db](https://github.com/dsebastien/obsidian-time-machine/commit/5f620dbb0d0a51506358a8e55010724f1b985fe2))

## [0.4.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.3.0...0.4.0) (2026-02-12)

### Features

* **all:** added command to force the creation of a snapshot using file recovery ([0065121](https://github.com/dsebastien/obsidian-time-machine/commit/00651218d0951bd8c955b92dfd171813cef728cd))

## [0.3.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.2.0...0.3.0) (2026-02-12)

### Features

* **all:** added git support (desktop only) ([b447efa](https://github.com/dsebastien/obsidian-time-machine/commit/b447efab4b2636fcc04033f8bec697175fb7c59a))

## [0.2.0](https://github.com/dsebastien/obsidian-time-machine/compare/0.1.0...0.2.0) (2026-02-11)

### Features

* **all:** added more spacing between the slider and dates ([92a7138](https://github.com/dsebastien/obsidian-time-machine/commit/92a7138f8bcf43f11637f503e23ec1952dc5bb02))
* **all:** improved styling of the slider ([131b73d](https://github.com/dsebastien/obsidian-time-machine/commit/131b73d8952fa55132088729158b2a46b6cbeea4))

## 0.1.0 (2026-02-11)

### Features

* **all:** added docs template ([30b9dbc](https://github.com/dsebastien/obsidian-time-machine/commit/30b9dbc317b3956e5f0748d5e171426533431fb2))
* **all:** added Obsidian mock for tests ([8e5cba6](https://github.com/dsebastien/obsidian-time-machine/commit/8e5cba61ce7b50edcfc5fae1a8b75f3eab78deab))
* **all:** added watch mechanism to update snapshots and diffs. Adapted manifests ([d4dbd7c](https://github.com/dsebastien/obsidian-time-machine/commit/d4dbd7c8a80517d35f92620255cf2c6edd108c3a))
* **all:** added watch/refresh mechanism to handle active note modifications vs diffs ([901149c](https://github.com/dsebastien/obsidian-time-machine/commit/901149c9722b22a172ed622b8157d2c988bd61f4))
* **all:** condense the view a bit more ([6e42928](https://github.com/dsebastien/obsidian-time-machine/commit/6e429285233189f89d7d20884cd5157116a378ca))
* **all:** improved compliancy with obsidian release checks ([74f80eb](https://github.com/dsebastien/obsidian-time-machine/commit/74f80eb778ebcc181ee1a8d8e9bce6e31bba3174))
* **all:** improved UI. Added slider ([3115264](https://github.com/dsebastien/obsidian-time-machine/commit/3115264e811844468b8a0db03118ede100481e46))
* **all:** improved visuals ([19670fd](https://github.com/dsebastien/obsidian-time-machine/commit/19670fd53e4fb3d22e5fa53b1af9c70c78540cde))
* **all:** initial version ([937b5d8](https://github.com/dsebastien/obsidian-time-machine/commit/937b5d80cabf15ad7061bf2794915b99e1d07b15))
* **all:** snapshots with no differences for the current file are now filtered out ([932deb0](https://github.com/dsebastien/obsidian-time-machine/commit/932deb019a8b05572e7fb189678a5ec6fc6060d0))
* **all:** updated scripts ([7949163](https://github.com/dsebastien/obsidian-time-machine/commit/7949163757b2b87e05bf3d029f99d2a329c08a5a))
* **all:** updated scripts ([4b956ac](https://github.com/dsebastien/obsidian-time-machine/commit/4b956acbb71e41801fcd40f4e5d8eebb28221fc1))

### Bug Fixes

* **all:** adapt the build.ts to be generic ([d4da8a1](https://github.com/dsebastien/obsidian-time-machine/commit/d4da8a1d8a839800785a89dda1594ff52f049607))
* **all:** fied the release workflow to name the tags correctly ([95aa6ff](https://github.com/dsebastien/obsidian-time-machine/commit/95aa6ffd40e718d055e24e1f052ed374e171376b))
* **all:** fix image url ([1a0086b](https://github.com/dsebastien/obsidian-time-machine/commit/1a0086b1982b8da1f6e3c3135f27dcd9bb2ff787))
* **all:** use console.debug instead of console.log ([09306e4](https://github.com/dsebastien/obsidian-time-machine/commit/09306e492c81437dff10dfe8b3b5e5734be1382a))



















