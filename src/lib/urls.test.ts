import { describe, expect, it } from 'vitest'
import {
  extractInstagramUrls,
  normalizeInstagramUrl,
  postIdFromUrl,
} from './urls'

describe('normalizeInstagramUrl', () => {
  it('normalizes posts and reels', () => {
    expect(normalizeInstagramUrl('https://www.instagram.com/p/AbC123/')).toBe(
      'https://www.instagram.com/p/AbC123/',
    )
    expect(
      normalizeInstagramUrl('https://instagram.com/reel/XyZ999/?igsh=1'),
    ).toBe('https://www.instagram.com/reel/XyZ999/')
    expect(normalizeInstagramUrl('https://www.instagram.com/tv/OldTv1')).toBe(
      'https://www.instagram.com/tv/OldTv1/',
    )
  })

  it('rejects non-instagram urls', () => {
    expect(normalizeInstagramUrl('https://example.com/p/AbC')).toBeNull()
  })
})

describe('extractInstagramUrls', () => {
  it('finds multiple urls in text', () => {
    const text =
      'see https://www.instagram.com/p/OneTwo/ and https://instagram.com/reel/ThreeFour/'
    expect(extractInstagramUrls(text)).toEqual([
      'https://www.instagram.com/p/OneTwo/',
      'https://www.instagram.com/reel/ThreeFour/',
    ])
  })
})

describe('postIdFromUrl', () => {
  it('uses lowercase shortcode', () => {
    expect(postIdFromUrl('https://www.instagram.com/p/AbC123/')).toBe('abc123')
  })
})
