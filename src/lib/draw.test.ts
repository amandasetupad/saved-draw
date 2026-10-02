import { describe, expect, it } from 'vitest'
import type { SavedPost } from '../types'
import { drawRandom, postsForDraw } from './draw'

function post(id: string, status: SavedPost['status']): SavedPost {
  return {
    id,
    url: `https://www.instagram.com/p/${id}/`,
    shortcode: id,
    status,
    source: 'manual',
    addedAt: 1,
    updatedAt: 1,
  }
}

describe('draw', () => {
  it('filters todo pool', () => {
    const posts = [
      post('a', 'todo'),
      post('b', 'completed'),
      post('c', 'wont_do'),
    ]
    expect(postsForDraw(posts, 'todo').map((p) => p.id)).toEqual(['a'])
    expect(postsForDraw(posts, 'all')).toHaveLength(3)
  })

  it('draws deterministically with injected random', () => {
    const posts = [post('a', 'todo'), post('b', 'todo'), post('c', 'todo')]
    expect(drawRandom(posts, 'todo', () => 0)?.id).toBe('a')
    expect(drawRandom(posts, 'todo', () => 0.99)?.id).toBe('c')
    expect(drawRandom([], 'todo')).toBeNull()
  })
})
