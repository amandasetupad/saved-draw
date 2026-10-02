import { describe, expect, it } from 'vitest'
import type { SavedPost } from '../types'
import {
  categoryForPost,
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

describe('reel charts', () => {
  it('counts reels per month and leaves a gap month at zero', () => {
    const stats = computeLibraryStats([
      post({
        id: 'jan',
        url: 'https://www.instagram.com/reel/jan/',
        savedAt: new Date(2024, 0, 10).getTime(),
        caption: 'Weeknight #pasta recipe',
      }),
      post({
        id: 'mar',
        url: 'https://www.instagram.com/reel/mar/',
        savedAt: new Date(2024, 2, 10).getTime(),
        caption: 'New #outfit ootd',
      }),
      post({
        id: 'photo',
        url: 'https://www.instagram.com/p/photo/',
        savedAt: new Date(2024, 1, 10).getTime(),
        caption: 'ignored photo',
      }),
    ])
    expect(stats.chartSubject).toBe('reels')
    expect(stats.reelsByMonth.map((bar) => [bar.month, bar.count])).toEqual([
      [0, 1],
      [1, 0],
      [2, 1],
    ])
    expect(stats.reelCategories.map((slice) => slice.label).sort()).toEqual(['Fashion', 'Food'])
  })

  it('falls back to every save when nothing is a reel', () => {
    const stats = computeLibraryStats([
      post({
        id: 'a',
        savedAt: new Date(2024, 3, 2).getTime(),
        caption: 'Morning #yoga flow',
      }),
    ])
    expect(stats.chartSubject).toBe('saves')
    expect(stats.reelsByMonth).toHaveLength(1)
    expect(stats.reelCategories[0]).toMatchObject({ label: 'Fitness', count: 1 })
  })

  it('sends an unmatched caption to Other', () => {
    expect(categoryForPost({ caption: 'Hello there friend', hashtags: [] })).toBe('Other')
  })
})

describe('computeLibraryStats', () => {
  it('returns empty stats for an empty library', () => {
    expect(computeLibraryStats([])).toEqual({
      oldest: null,
      topWord: null,
      busiestMonth: null,
      topHashtag: null,
      chartSubject: 'saves',
      reelsByMonth: [],
      reelCategories: [],
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
