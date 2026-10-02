import type { SavedPost } from '../types'

/** Common English function words; keep short enough for caption-token stats. */
export const STOPWORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
])

const URL_RE = /https?:\/\/\S+|www\.\S+/gi
const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu
const TOKEN_RE = /[\p{L}\p{N}_]+/gu

export interface OldestPostStat {
  author?: string
  shortcode: string
  url: string
  savedAt: number
}

export interface CountedStat {
  value: string
  count: number
}

export interface BusiestMonthStat {
  year: number
  /** 0–11, local calendar month. */
  month: number
  label: string
  count: number
}

export interface LibraryStats {
  oldest: OldestPostStat | null
  topWord: CountedStat | null
  busiestMonth: BusiestMonthStat | null
  topHashtag: CountedStat | null
}

function normalizeHashtag(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase()
}

/** Tokens for word frequency (descriptions only). */
export function tokenizeDescription(text: string): string[] {
  const withoutUrls = text.replace(URL_RE, ' ')
  const tokens: string[] = []
  for (const match of withoutUrls.matchAll(TOKEN_RE)) {
    const token = match[0].toLowerCase()
    if (token.length < 3) continue
    if (STOPWORDS.has(token)) continue
    if (token === 'instagram') continue
    tokens.push(token)
  }
  return tokens
}

/** Hashtags from caption text (#tags) and any dedicated field. */
export function collectHashtags(post: Pick<SavedPost, 'caption' | 'hashtags'>): string[] {
  const found = new Set<string>()

  for (const tag of post.hashtags ?? []) {
    const normalized = normalizeHashtag(tag)
    if (normalized) found.add(normalized)
  }

  const caption = post.caption ?? ''
  for (const match of caption.matchAll(HASHTAG_RE)) {
    const normalized = normalizeHashtag(match[1] ?? '')
    if (normalized) found.add(normalized)
  }

  return [...found]
}

function monthKey(ms: number): { year: number; month: number; key: string } {
  const d = new Date(ms)
  const year = d.getFullYear()
  const month = d.getMonth()
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` }
}

function monthLabel(year: number, month: number): string {
  const name = new Date(year, month, 1).toLocaleString(undefined, { month: 'long' })
  return `${name} ${year}`
}

export function computeLibraryStats(posts: SavedPost[]): LibraryStats {
  if (posts.length === 0) {
    return {
      oldest: null,
      topWord: null,
      busiestMonth: null,
      topHashtag: null,
    }
  }

  let oldest: OldestPostStat | null = null
  for (const post of posts) {
    if (post.savedAt == null) continue
    if (!oldest || post.savedAt < oldest.savedAt) {
      oldest = {
        author: post.author,
        shortcode: post.shortcode,
        url: post.url,
        savedAt: post.savedAt,
      }
    }
  }

  const wordCounts = new Map<string, number>()
  for (const post of posts) {
    if (!post.caption) continue
    for (const word of tokenizeDescription(post.caption)) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1)
    }
  }
  let topWord: CountedStat | null = null
  for (const [value, count] of wordCounts) {
    if (
      !topWord ||
      count > topWord.count ||
      (count === topWord.count && value < topWord.value)
    ) {
      topWord = { value, count }
    }
  }

  const monthCounts = new Map<string, { year: number; month: number; count: number }>()
  for (const post of posts) {
    if (post.savedAt == null) continue
    const { year, month, key } = monthKey(post.savedAt)
    const prev = monthCounts.get(key)
    if (prev) prev.count += 1
    else monthCounts.set(key, { year, month, count: 1 })
  }
  let busiestMonth: BusiestMonthStat | null = null
  for (const entry of monthCounts.values()) {
    const candidate: BusiestMonthStat = {
      year: entry.year,
      month: entry.month,
      label: monthLabel(entry.year, entry.month),
      count: entry.count,
    }
    if (
      !busiestMonth ||
      candidate.count > busiestMonth.count ||
      (candidate.count === busiestMonth.count &&
        (candidate.year > busiestMonth.year ||
          (candidate.year === busiestMonth.year &&
            candidate.month > busiestMonth.month)))
    ) {
      busiestMonth = candidate
    }
  }

  const tagCounts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of collectHashtags(post)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  let topHashtag: CountedStat | null = null
  for (const [value, count] of tagCounts) {
    if (
      !topHashtag ||
      count > topHashtag.count ||
      (count === topHashtag.count && value < topHashtag.value)
    ) {
      topHashtag = { value: `#${value}`, count }
    }
  }

  return { oldest, topWord, busiestMonth, topHashtag }
}
