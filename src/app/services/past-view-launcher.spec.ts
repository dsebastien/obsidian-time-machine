import { expect, test } from 'bun:test'
import { supportsPastViewFile } from './past-view-launcher'

test('supports past views for Markdown and Canvas files only', () => {
    expect(supportsPastViewFile({ extension: 'md' })).toBe(true)
    expect(supportsPastViewFile({ extension: 'canvas' })).toBe(true)
    expect(supportsPastViewFile({ extension: 'txt' })).toBe(false)
})
