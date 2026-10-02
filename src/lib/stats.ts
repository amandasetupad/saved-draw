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

export interface MonthBar {
  year: number
  /** 0–11, local calendar month. */
  month: number
  label: string
  count: number
}

export interface CategorySlice {
  label: string
  count: number
}

export interface LibraryStats {
  oldest: OldestPostStat | null
  topWord: CountedStat | null
  busiestMonth: BusiestMonthStat | null
  topHashtag: CountedStat | null
  /** Reels when the library has any; otherwise every dated save. */
  chartSubject: 'reels' | 'saves'
  reelsByMonth: MonthBar[]
  reelCategories: CategorySlice[]
}

const CATEGORIES: { label: string; words: string[] }[] = [
  {
    label: 'Food',
    words: ['food', 'recipe', 'cooking', 'baking', 'dinner', 'foodie', 'chef', 'restaurant', 'cake'],
  },
  {
    label: 'Fashion',
    words: ['fashion', 'outfit', 'ootd', 'style', 'streetstyle', 'wardrobe'],
  },
  {
    label: 'Beauty',
    words: ['makeup', 'skincare', 'beauty', 'hair', 'nails', 'cosmetic'],
  },
  {
    label: 'Home',
    words: ['home', 'interior', 'decor', 'renovation', 'diy', 'furniture'],
  },
  {
    label: 'Travel',
    words: ['travel', 'trip', 'vacation', 'wanderlust', 'hotel', 'city'],
  },
  {
    label: 'Fitness',
    words: ['fitness', 'workout', 'gym', 'yoga', 'running'],
  },
  {
    label: 'Art',
    words: ['art', 'design', 'illustration', 'photography', 'drawing'],
  },
  {
    label: 'Music',
    words: ['music', 'song', 'concert', 'playlist'],
  },
]

export function isReelUrl(url: string): boolean {
  return /\/reel\//i.test(url)
}

function keywordHits(tokens: Set<string>, keyword: string): boolean {
  if (tokens.has(keyword)) return true
  if (keyword.length < 4) return false
  for (const token of tokens) {
    if (token.includes(keyword)) return true
  }
  return false
}

/** One category per post, from hashtags and caption words. */
export function categoryForPost(post: Pick<SavedPost, 'caption' | 'hashtags'>): string {
  const tokens = new Set<string>([
    ...collectHashtags(post),
    ...(post.caption ? tokenizeDescription(post.caption) : []),
  ])
  let best: { label: string; score: number } | null = null
  for (const category of CATEGORIES) {
    let score = 0
    for (const word of category.words) {
      if (keywordHits(tokens, word)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { label: category.label, score }
    }
  }
  return best?.label ?? 'Other'
}

function monthSeries(posts: SavedPost[]): MonthBar[] {
  const dated = posts.filter((post) => post.savedAt != null)
  if (dated.length === 0) return []

  const counts = new Map<string, number>()
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const post of dated) {
    const savedAt = post.savedAt as number
    const { year, month, key } = monthKey(savedAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    const index = year * 12 + month
    if (index < min) min = index
    if (index > max) max = index
  }

  const bars: MonthBar[] = []
  for (let index = min; index <= max; index += 1) {
    const year = Math.floor(index / 12)
    const month = index % 12
    const key = `${year}-${String(month).padStart(2, '0')}`
    bars.push({
      year,
      month,
      label: monthLabel(year, month),
      count: counts.get(key) ?? 0,
    })
  }
  return bars
}

function categorySlices(posts: SavedPost[]): CategorySlice[] {
  const counts = new Map<string, number>()
  for (const post of posts) {
    const label = categoryForPost(post)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
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
      chartSubject: 'saves',
      reelsByMonth: [],
      reelCategories: [],
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

  const charts = chartsFromPosts(posts)

  return {
    oldest,
    topWord,
    busiestMonth,
    topHashtag,
    ...charts,
  }
}

/** Reels when the library has any; otherwise every save. */
export function chartsFromPosts(posts: SavedPost[]): Pick<
  LibraryStats,
  'chartSubject' | 'reelsByMonth' | 'reelCategories'
> {
  const reels = posts.filter((post) => isReelUrl(post.url))
  const chartPosts = reels.length > 0 ? reels : posts
  return {
    chartSubject: reels.length > 0 ? 'reels' : 'saves',
    reelsByMonth: monthSeries(chartPosts),
    reelCategories: categorySlices(chartPosts),
  }
}
