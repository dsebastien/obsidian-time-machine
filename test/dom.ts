/**
 * Recording mock DOM for component tests.
 *
 * The obsidian package is types-only, and these components build their UI with
 * Obsidian's `createDiv` / `createEl` helpers. This records every element that
 * gets created — its class, text, and attributes — plus the click and keydown
 * handlers registered on it, so a test can assert what was rendered and
 * simulate interaction by class name.
 *
 * Everything here is explicitly typed, and it deliberately does not import
 * `mock` from `bun:test`: without Bun's ambient types that helper resolves to
 * `any`, which produced unsafe-call warnings in Obsidian's plugin review. The
 * tiny spy below covers what these tests need with types that hold everywhere.
 */

/** A callable that records how many times it ran. */
export interface Spy {
    (): void
    calls: number
}

function createSpy(): Spy {
    const spy = (() => {
        spy.calls += 1
    }) as Spy
    spy.calls = 0
    return spy
}

/** Options accepted by Obsidian's `createDiv` / `createSpan` / `createEl`. */
export interface ElOptions {
    cls?: string
    text?: string
    attr?: Record<string, string>
}

/** A rectangle, as returned by `getBoundingClientRect`. */
export interface MockRect {
    left: number
    right: number
    width: number
    top: number
    bottom: number
    height: number
}

/**
 * The shape the components actually use. Kept narrow on purpose: anything a
 * component reaches for that is missing here shows up as a test failure rather
 * than being silently swallowed by a permissive type.
 */
export interface MockElement {
    clientWidth: number
    clientHeight: number
    scrollLeft: number
    scrollWidth: number
    tabIndex: number
    textContent: string
    ownerDocument: { activeElement: MockElement | null }
    win: {
        requestAnimationFrame: (cb: () => void) => number
        setTimeout: (cb: () => void) => number
    }
    getBoundingClientRect: () => MockRect
    focus: () => void
    empty: Spy
    createDiv: (opts?: ElOptions) => MockElement
    createSpan: (opts?: ElOptions) => MockElement
    createEl: (tag: string, opts?: ElOptions) => MockElement
    addClass: () => void
    setText: (value: string) => void
    setAttribute: (name: string, value: string) => void
    prepend: () => void
    addEventListener: (type: string, fn: (event: unknown) => void) => void
    style: { setProperty: (name: string, value: string) => void }
    children: unknown[]
}

export interface Recording {
    /** Class strings of every created element, in creation order. */
    classes: string[]
    /** Text of every created element that had any. */
    texts: string[]
    /** Click handlers, keyed by the owning element's class string. */
    clicksByClass: Map<string, (event?: unknown) => void>
    /**
     * Every click handler in creation order. `clicksByClass` keeps only the
     * last handler per class, which loses all but one of a repeated element
     * such as a bucket label.
     */
    clickList: { cls: string; fn: (event?: unknown) => void }[]
    /** Keydown handlers, keyed by the owning element's class string. */
    keysByClass: Map<string, (event: unknown) => void>
    /** Inline styles set via `style.setProperty`, keyed by class string. */
    stylesByClass: Map<string, Record<string, string>>
    /** Attributes, from creation options and `setAttribute`, keyed by class string. */
    attrsByClass: Map<string, Record<string, string>>
    /** Class strings of elements that had `focus()` called on them. */
    focused: string[]
    /** Callbacks deferred via `requestAnimationFrame`/`setTimeout`, uninvoked. */
    animationFrames: (() => void)[]
    /** The created elements themselves, keyed by class string. */
    focusables: Map<string, MockElement>
}

export function createRecording(): Recording {
    return {
        classes: [],
        texts: [],
        clicksByClass: new Map(),
        clickList: [],
        keysByClass: new Map(),
        stylesByClass: new Map(),
        attrsByClass: new Map(),
        focused: [],
        animationFrames: [],
        focusables: new Map()
    }
}

const EMPTY_RECT: MockRect = { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 }

/**
 * @param clientWidth width reported by every element, so layout-dependent
 * components can be exercised at a chosen size.
 */
export function createRecordingEl(rec: Recording, ownCls = '', clientWidth = 600): HTMLElement {
    return createMockEl(rec, ownCls, clientWidth) as unknown as HTMLElement
}

/** Same element, typed as the mock rather than as an `HTMLElement`. */
export function createMockEl(rec: Recording, ownCls = '', clientWidth = 600): MockElement {
    const child = (opts?: ElOptions): MockElement => {
        const cls = opts?.cls ?? ''
        if (cls) rec.classes.push(cls)
        if (opts?.text) rec.texts.push(opts.text)
        if (opts?.attr) {
            rec.attrsByClass.set(cls, { ...(rec.attrsByClass.get(cls) ?? {}), ...opts.attr })
        }
        return createMockEl(rec, cls, clientWidth)
    }

    const el: MockElement = {
        clientWidth,
        clientHeight: 0,
        scrollLeft: 0,
        scrollWidth: 0,
        tabIndex: 0,
        textContent: '',
        ownerDocument: { activeElement: null },
        // Obsidian augments elements with `win`. Callbacks are captured rather
        // than run, so layout-dependent code stays out of these tests.
        win: {
            requestAnimationFrame: (cb: () => void) => {
                rec.animationFrames.push(cb)
                return 0
            },
            setTimeout: (cb: () => void) => {
                rec.animationFrames.push(cb)
                return 0
            }
        },
        getBoundingClientRect: () => EMPTY_RECT,
        focus: () => {
            rec.focused.push(ownCls)
        },
        empty: createSpy(),
        createDiv: (opts?: ElOptions) => child(opts),
        createSpan: (opts?: ElOptions) => child(opts),
        createEl: (_tag: string, opts?: ElOptions) => child(opts),
        addClass: () => {},
        setText: (value: string) => {
            rec.texts.push(value)
        },
        setAttribute: (name: string, value: string) => {
            const existing = rec.attrsByClass.get(ownCls) ?? {}
            existing[name] = value
            rec.attrsByClass.set(ownCls, existing)
        },
        prepend: () => {},
        addEventListener: (type: string, fn: (event: unknown) => void) => {
            if (type === 'click') {
                rec.clicksByClass.set(ownCls, fn)
                rec.clickList.push({ cls: ownCls, fn })
            }
            if (type === 'keydown') rec.keysByClass.set(ownCls, fn)
        },
        style: {
            setProperty: (name: string, value: string) => {
                const existing = rec.stylesByClass.get(ownCls) ?? {}
                existing[name] = value
                rec.stylesByClass.set(ownCls, existing)
            }
        },
        children: []
    }

    if (ownCls) rec.focusables.set(ownCls, el)
    return el
}

/** Finds a recorded click handler whose class string contains `fragment`. */
export function clickByClassContaining(
    rec: Recording,
    fragment: string
): ((event?: unknown) => void) | undefined {
    for (const [cls, fn] of rec.clicksByClass) {
        if (cls.includes(fragment)) return fn
    }
    return undefined
}
