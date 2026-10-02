import { beforeEach, describe, expect, it } from 'vitest'
import type { ImportedPost, SavedPost } from '../types'
import {
  DB_NAME,
  STORAGE_KEY,
  loadPosts,
  mergeImportedPosts,
  savePosts,
  setPostStatus,
} from './storage'

function sample(id: string, status: SavedPost['status'] = 'todo'): SavedPost {
  return {
    id,
    url: `https://www.instagram.com/p/${id}/`,
    shortcode: id,
    status,
    source: 'export',
    addedAt: 1,
    updatedAt: 1,
  }
}

async function resetStorage() {
  localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}

describe('storage merge', () => {
  beforeEach(async () => {
    await resetStorage()
  })

  it('preserves completed and wont_do on re-import', () => {
    const existing = [
      sample('keepdone', 'completed'),
      sample('skipme', 'wont_do'),
      sample('open', 'todo'),
    ]
    const imported: ImportedPost[] = [
      { url: 'https://www.instagram.com/p/keepdone/', author: 'a' },
      { url: 'https://www.instagram.com/p/skipme/', author: 'b' },
      { url: 'https://www.instagram.com/p/brandnew/', author: 'c' },
    ]
    const { posts, added, updated } = mergeImportedPosts(
      existing,
      imported,
      'export',
    )
    expect(added).toBe(1)
    expect(updated).toBe(2)
    expect(posts.find((p) => p.id === 'keepdone')?.status).toBe('completed')
    expect(posts.find((p) => p.id === 'skipme')?.status).toBe('wont_do')
    expect(posts.find((p) => p.id === 'brandnew')?.status).toBe('todo')
    expect(posts.find((p) => p.id === 'keepdone')?.author).toBe('a')
  })

  it('fills caption and hashtags on re-import without clearing marks', () => {
    const existing = [
      {
        ...sample('oldpost', 'completed'),
        author: 'baker',
      },
    ]
    const imported: ImportedPost[] = [
      {
        url: 'https://www.instagram.com/p/oldpost/',
        author: 'baker',
        caption: 'Fresh loaf #sourdough',
        hashtags: ['sourdough', 'bread'],
        savedAt: 1700000000000,
      },
    ]
    const { posts } = mergeImportedPosts(existing, imported, 'export')
    const next = posts.find((p) => p.id === 'oldpost')
    expect(next?.status).toBe('completed')
    expect(next?.caption).toBe('Fresh loaf #sourdough')
    expect(next?.hashtags).toEqual(['sourdough', 'bread'])
    expect(next?.savedAt).toBe(1700000000000)
  })

  it('round-trips IndexedDB', async () => {
    const posts = [sample('abc', 'completed')]
    await savePosts(posts)
    expect(await loadPosts()).toEqual(posts)
  })

  it('migrates localStorage into IndexedDB once, then drops the key', async () => {
    const posts = [
      sample('legacy1', 'completed'),
      sample('legacy2', 'wont_do'),
    ]
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, posts }),
    )

    const loaded = await loadPosts()
    expect(loaded).toEqual(posts)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    // Second load uses IndexedDB only; marks still present.
    expect(await loadPosts()).toEqual(posts)
    expect(loaded.find((p) => p.id === 'legacy1')?.status).toBe('completed')
    expect(loaded.find((p) => p.id === 'legacy2')?.status).toBe('wont_do')
  })

  it('prefers IndexedDB over leftover localStorage', async () => {
    await savePosts([sample('idb', 'todo')])
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, posts: [sample('legacy', 'completed')] }),
    )
    const loaded = await loadPosts()
    expect(loaded).toEqual([sample('idb', 'todo')])
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('updates status', () => {
    const next = setPostStatus([sample('x')], 'x', 'wont_do')
    expect(next[0]?.status).toBe('wont_do')
  })
})
