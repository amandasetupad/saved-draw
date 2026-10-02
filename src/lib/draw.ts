import type { DrawPool, SavedPost } from '../types'

export function postsForDraw(posts: SavedPost[], pool: DrawPool): SavedPost[] {
  if (pool === 'todo') return posts.filter((p) => p.status === 'todo')
  return posts
}

export function drawRandom(
  posts: SavedPost[],
  pool: DrawPool,
  random: () => number = Math.random,
): SavedPost | null {
  const poolPosts = postsForDraw(posts, pool)
  if (poolPosts.length === 0) return null
  const index = Math.floor(random() * poolPosts.length)
  return poolPosts[index] ?? null
}
