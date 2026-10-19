import { describe, expect, it } from 'vitest'

import { base64UrlToBytes } from './push'

describe('base64UrlToBytes', () => {
  it('decodes unpadded URL-safe base64 (the VAPID key format)', () => {
    expect([...base64UrlToBytes('-_8')]).toEqual([0xfb, 0xff])
    expect([...base64UrlToBytes('AQID')]).toEqual([1, 2, 3])
    expect(base64UrlToBytes('B' + 'A'.repeat(86)).length).toBe(65)
  })
})
