import { describe, expect, it } from 'vitest'

import { SECTION_IMAGE_INVALID_CONTENT_MESSAGE, sectionImageUploadContentError } from '@/lib/resource-upload-policy'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('sectionImageUploadContentError', () => {
  it.each([
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)],
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['gif', text('GIF89a....')],
    ['webp', new Uint8Array([...text('RIFF'), 0, 0, 0, 0, ...text('WEBPVP8 ')])],
    ['heic', new Uint8Array([0, 0, 0, 24, ...text('ftypheic')])],
    ['svg', text('﻿  <?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')],
  ])('accepts a real %s', async (_name, content) => {
    await expect(sectionImageUploadContentError(new Blob([content]))).resolves.toBeNull()
  })

  it('rejects a text file renamed to .png', async () => {
    const file = new File(['hola, no soy una imagen'], 'falsa.png', { type: 'image/png' })
    await expect(sectionImageUploadContentError(file)).resolves.toBe(SECTION_IMAGE_INVALID_CONTENT_MESSAGE)
  })

  it('rejects an empty file', async () => {
    await expect(sectionImageUploadContentError(new Blob([]))).resolves.toBe(SECTION_IMAGE_INVALID_CONTENT_MESSAGE)
  })
})
