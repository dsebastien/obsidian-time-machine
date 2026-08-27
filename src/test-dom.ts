import { mock } from 'bun:test'

/**
 * Recording mock DOM for component tests.
 *
 * The obsidian package is types-only, and these components build their UI with
 * Obsidian's `createDiv` / `createEl` helpers. This records every element that
 * gets created — its class, text, and attributes — plus the click and keydown
 * handlers registered on it, so a test can assert what was rendered and
 * simulate interaction by class name.
 */

export interface Recording {
    /** Class strings of every created element, in creation order. */
    classes: string[]
    /** Text of every created element that had any. */
    texts: string[]
    /** Click handlers, keyed by the owning element's class string. */
    clicksByClass: Map<string, (event?: unknown) => void>
    /** Keydown handlers, keyed by the owning element's class string. */
    keysByClass: Map<string, (event: unknown) => void>
    /** Inline styles set via `style.setProperty`, keyed by class string. */
    stylesByClass: Map<string, Record<string, string>>
    /** Attributes, from creation options and `setAttribute`, keyed by class string. */
    attrsByClass: Map<string, Record<string, string>>
    /** Class strings of elements that had `focus()` called on them. */
    focused: string[]
    /** Callbacks handed to `requestAnimationFrame`, uninvoked. */
    animationFrames: (() => void)[]
    /** The created elements themselves, keyed by class string. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    focusables: Map<string, any>
}

export function createRecording(): Recording {
    return {
        classes: [],
        texts: [],
        clicksByClass: new Map(),
        keysByClass: new Map(),
        stylesByClass: new Map(),
        attrsByClass: new Map(),
        focused: [],
        animationFrames: [],
        focusables: new Map()
    }
}

interface ElOptions {
    cls?: string
    text?: string
    attr?: Record<string, string>
}

/**
 * @param clientWidth width reported by every element, so layout-dependent
 * components can be exercised at a chosen size.
 */
export function createRecordingEl(rec: Recording, ownCls = '', clientWidth = 600): HTMLElement {
    const child = (opts?: ElOptions): HTMLElement => {
        const cls = opts?.cls ?? ''
        if (cls) rec.classes.push(cls)
        if (opts?.text) rec.texts.push(opts.text)
        if (opts?.attr) {
            rec.attrsByClass.set(cls, { ...(rec.attrsByClass.get(cls) ?? {}), ...opts.attr })
        }
        return createRecordingEl(rec, cls, clientWidth)
    }

    const el = {
        clientWidth,
        tabIndex: 0,
        textContent: '',
        ownerDocument: { activeElement: null as unknown },
        // Obsidian augments elements with `win`. Callbacks are captured rather
        // than run, so layout-dependent code stays out of these tests.
        win: {
            requestAnimationFrame: (cb: () => void) => {
                rec.animationFrames.push(cb)
                return 0
            }
        },
        getBoundingClientRect: () => ({
            left: 0,
            right: 0,
            width: 0,
            top: 0,
            bottom: 0,
            height: 0
        }),
        scrollLeft: 0,
        scrollWidth: 0,
        clientHeight: 0,
        focus: () => {
            rec.focused.push(ownCls)
        },
        empty: mock(() => {}),
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
            if (type === 'click') rec.clicksByClass.set(ownCls, fn)
            if (type === 'keydown') rec.keysByClass.set(ownCls, fn)
        },
        style: {
            setProperty: (name: string, value: string) => {
                const existing = rec.stylesByClass.get(ownCls) ?? {}
                existing[name] = value
                rec.stylesByClass.set(ownCls, existing)
            }
        },
        children: [] as unknown[]
    }

    if (ownCls) rec.focusables.set(ownCls, el)
    return el as unknown as HTMLElement
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
