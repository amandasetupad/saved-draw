import type { ImportedPost, PostSource, PostStatus, SavedPost } from '../types'
import { normalizeInstagramUrl, postIdFromUrl, shortcodeFromUrl } from './urls'

/** Legacy localStorage key; read once for migration into IndexedDB. */
export const STORAGE_KEY = 'saved-draw:v1'

export const DB_NAME = 'saved-draw'
export const DB_VERSION = 1
export const STORE_NAME = 'posts'

interface StoredState {
  version: 1
  posts: SavedPost[]
}

function now() {
  return Date.now()
}

function readLegacyLocalStorage(): SavedPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredState
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.posts)) return []
    return parsed.posts
  } catch {
    return []
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      reject(err)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked'))
  })
}

function getAllFromStore(db: IDBDatabase): Promise<SavedPost[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as SavedPost[])
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read posts'))
  })
}

function putAllInStore(db: IDBDatabase, posts: SavedPost[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    for (const post of posts) {
      store.put(post)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not save posts'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not save posts'))
  })
}

export function storageErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Browser storage is full. Free some space and try again.'
  }
  return 'Could not save in this browser. Try leaving private browsing, or free some space.'
}

/**
 * Load posts from IndexedDB. If the store is empty, copy legacy localStorage
 * data (if any), then remove that key only after the IndexedDB write succeeds.
 */
export async function loadPosts(): Promise<SavedPost[]> {
  const db = await openDb()
  try {
    const existing = await getAllFromStore(db)
    if (existing.length > 0) return existing

    const legacy = readLegacyLocalStorage()
    if (legacy.length > 0) {
      await putAllInStore(db, legacy)
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // IndexedDB is already the source of truth; ignore cleanup failure.
      }
      return legacy
    }

    // Another tab/load may have migrated while localStorage was already cleared.
    return await getAllFromStore(db)
  } finally {
    db.close()
  }
}

export async function savePosts(posts: SavedPost[]): Promise<void> {
  const db = await openDb()
  try {
    await putAllInStore(db, posts)
  } finally {
    db.close()
  }
}

export function createPostFromImport(
  item: ImportedPost,
  source: PostSource,
  existing?: SavedPost,
): SavedPost | null {
  const url = normalizeInstagramUrl(item.url)
  if (!url) return null
  const id = postIdFromUrl(url)
  const shortcode = shortcodeFromUrl(url)
  if (!id || !shortcode) return null

  const stamp = now()
  if (existing) {
    return {
      ...existing,
      url,
      shortcode,
      author: item.author ?? existing.author,
      caption: item.caption ?? existing.caption,
      hashtags:
        item.hashtags && item.hashtags.length > 0
          ? item.hashtags
          : existing.hashtags,
      collection: item.collection ?? existing.collection,
      savedAt: item.savedAt ?? existing.savedAt,
      source: existing.source === 'manual' && source === 'export' ? 'manual' : source,
      updatedAt: stamp,
    }
  }

  return {
    id,
    url,
    shortcode,
    author: item.author,
    caption: item.caption,
    hashtags: item.hashtags,
    collection: item.collection,
    savedAt: item.savedAt,
    status: 'todo',
    source,
    addedAt: stamp,
    updatedAt: stamp,
  }
}

/** Merge imports into existing posts, preserving Completed / Won't do marks. */
export function mergeImportedPosts(
  existing: SavedPost[],
  imported: ImportedPost[],
  source: PostSource,
): { posts: SavedPost[]; added: number; updated: number } {
  const byId = new Map(existing.map((p) => [p.id, p]))
  let added = 0
  let updated = 0

  for (const item of imported) {
    const url = normalizeInstagramUrl(item.url)
    const id = url ? postIdFromUrl(url) : null
    if (!id) continue
    const prev = byId.get(id)
    const next = createPostFromImport(item, source, prev)
    if (!next) continue
    if (prev) updated += 1
    else added += 1
    byId.set(id, next)
  }

  const posts = [...byId.values()].sort((a, b) => {
    const aTime = a.savedAt ?? a.addedAt
    const bTime = b.savedAt ?? b.addedAt
    return bTime - aTime
  })

  return { posts, added, updated }
}

export function setPostStatus(
  posts: SavedPost[],
  id: string,
  status: PostStatus,
): SavedPost[] {
  return posts.map((p) =>
    p.id === id ? { ...p, status, updatedAt: now() } : p,
  )
}

export function removePost(posts: SavedPost[], id: string): SavedPost[] {
  return posts.filter((p) => p.id !== id)
}
