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
    /** Attributes passed at creation, keyed by class string. */
    attrsByClass: Map<string, Record<string, string>>
}

export function createRecording(): Recording {
    return {
        classes: [],
        texts: [],
        clicksByClass: new Map(),
        keysByClass: new Map(),
        stylesByClass: new Map(),
        attrsByClass: new Map()
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
        if (opts?.attr) rec.attrsByClass.set(cls, opts.attr)
        return createRecordingEl(rec, cls, clientWidth)
    }

    const el = {
        clientWidth,
        tabIndex: 0,
        textContent: '',
        empty: mock(() => {}),
        createDiv: (opts?: ElOptions) => child(opts),
        createSpan: (opts?: ElOptions) => child(opts),
        createEl: (_tag: string, opts?: ElOptions) => child(opts),
        addClass: () => {},
        setAttribute: () => {},
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
