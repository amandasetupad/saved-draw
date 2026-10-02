import { describe, expect, it } from 'vitest'
import type { SavedPost } from '../types'
import {
  collectHashtags,
  computeLibraryStats,
  tokenizeDescription,
} from './stats'

function post(partial: Partial<SavedPost> & Pick<SavedPost, 'id'>): SavedPost {
  return {
    url: `https://www.instagram.com/p/${partial.id}/`,
    shortcode: partial.id,
    status: 'todo',
    source: 'export',
    addedAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('tokenizeDescription', () => {
  it('lowercases, drops stopwords, short tokens, urls, and instagram', () => {
    expect(
      tokenizeDescription(
        'The BEST Recipe on Instagram! Visit https://example.com/x for Tip #1',
      ),
    ).toEqual(['best', 'recipe', 'visit', 'tip'])
  })

  it('strips punctuation and bare hash markers', () => {
    expect(tokenizeDescription('Hello, world!!! # food')).toEqual([
      'hello',
      'world',
      'food',
    ])
  })
})

describe('collectHashtags', () => {
  it('merges caption tags and dedicated field, case-insensitive', () => {
    expect(
      collectHashtags({
        caption: 'Try #Pasta and #Bread',
        hashtags: ['Pasta', '#soup'],
      }).sort(),
    ).toEqual(['bread', 'pasta', 'soup'])
  })
})

describe('computeLibraryStats', () => {
  it('returns empty stats for an empty library', () => {
    expect(computeLibraryStats([])).toEqual({
      oldest: null,
      topWord: null,
      busiestMonth: null,
      topHashtag: null,
    })
  })

  it('finds the oldest saved post and ignores missing dates', () => {
    const stats = computeLibraryStats([
      post({ id: 'new', author: 'later', savedAt: Date.UTC(2024, 5, 1) }),
      post({ id: 'old', author: 'earliest', savedAt: Date.UTC(2020, 0, 15) }),
      post({ id: 'nodate', author: 'unknown' }),
    ])
    expect(stats.oldest).toMatchObject({
      author: 'earliest',
      shortcode: 'old',
      url: 'https://www.instagram.com/p/old/',
      savedAt: Date.UTC(2020, 0, 15),
    })
  })

  it('picks the most common description word', () => {
    const stats = computeLibraryStats([
      post({
        id: 'a',
        caption: 'Sourdough bread baking bread tips',
        savedAt: 1,
      }),
      post({
        id: 'b',
        caption: 'More bread please and the flour',
        savedAt: 2,
      }),
    ])
    expect(stats.topWord).toEqual({ value: 'bread', count: 3 })
  })

  it('finds the busiest month and breaks ties toward the most recent', () => {
    const stats = computeLibraryStats([
      post({ id: 'a', savedAt: new Date(2023, 0, 5).getTime() }),
      post({ id: 'b', savedAt: new Date(2023, 0, 20).getTime() }),
      post({ id: 'c', savedAt: new Date(2024, 5, 1).getTime() }),
      post({ id: 'd', savedAt: new Date(2024, 5, 10).getTime() }),
    ])
    expect(stats.busiestMonth).toMatchObject({
      year: 2024,
      month: 5,
      count: 2,
    })
    expect(stats.busiestMonth?.label).toMatch(/2024/)
  })

  it('finds the most popular hashtag from captions and fields', () => {
    const stats = computeLibraryStats([
      post({
        id: 'a',
        caption: 'Love #Baking tonight',
        hashtags: ['bread'],
        savedAt: 1,
      }),
      post({
        id: 'b',
        caption: 'More #baking ideas',
        savedAt: 2,
      }),
      post({
        id: 'c',
        hashtags: ['soup'],
        savedAt: 3,
      }),
    ])
    expect(stats.topHashtag).toEqual({ value: '#baking', count: 2 })
  })

  it('reports null hashtag when none exist', () => {
    const stats = computeLibraryStats([
      post({ id: 'a', caption: 'plain text only', savedAt: 1 }),
    ])
    expect(stats.topHashtag).toBeNull()
  })

  it('includes completed and wont_do posts', () => {
    const stats = computeLibraryStats([
      post({
        id: 'done',
        status: 'completed',
        caption: 'uniquezzz uniquezzz',
        savedAt: Date.UTC(2019, 2, 1),
      }),
      post({
        id: 'skip',
        status: 'wont_do',
        caption: 'other',
        savedAt: Date.UTC(2022, 2, 1),
      }),
    ])
    expect(stats.oldest?.shortcode).toBe('done')
    expect(stats.topWord).toEqual({ value: 'uniquezzz', count: 2 })
  })
})
