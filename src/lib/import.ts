import JSZip from 'jszip'
import type { ImportResult, ImportedPost } from '../types'
import { extractInstagramUrls, normalizeInstagramUrl } from './urls'

const CANDIDATE_PATHS = [
  'your_instagram_activity/saved/saved_posts.json',
  'your_instagram_activity/saved/saved_collections.json',
  'saved/saved_posts.json',
  'saved/saved_collections.json',
  'saved_posts.json',
  'saved_collections.json',
]

const IG_URL_RE =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.-]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/i

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function timestampToMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

function pickUrl(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const normalized = normalizeInstagramUrl(c)
    if (normalized) return normalized
    if (IG_URL_RE.test(c)) {
      const found = extractInstagramUrls(c)
      if (found[0]) return found[0]
    }
  }
  return null
}

function fromStringMapData(
  map: Record<string, unknown>,
  author?: string,
  collection?: string,
): ImportedPost | null {
  const savedOn = asRecord(map['Saved on']) ?? asRecord(map['Saved On'])
  const href = pickUrl(
    savedOn?.href,
    savedOn?.value,
    asRecord(map.URL)?.href,
    asRecord(map.URL)?.value,
    map.href,
  )
  if (!href) return null

  const caption =
    (asRecord(map.Caption)?.value as string | undefined) ??
    (asRecord(map['Caption '])?.value as string | undefined)

  const savedAt = timestampToMs(savedOn?.timestamp ?? map.timestamp)

  return {
    url: href,
    author,
    caption: typeof caption === 'string' ? caption : undefined,
    collection,
    savedAt,
  }
}

function fromStringListData(
  list: unknown[],
  author?: string,
  collection?: string,
): ImportedPost[] {
  const out: ImportedPost[] = []
  for (const entry of list) {
    const rec = asRecord(entry)
    if (!rec) continue
    const href = pickUrl(rec.href, rec.value)
    if (!href) continue
    out.push({
      url: href,
      author,
      collection,
      savedAt: timestampToMs(rec.timestamp),
    })
  }
  return out
}

function findLabeledValue(
  node: unknown,
  wanted: string,
): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLabeledValue(item, wanted)
      if (found) return found
    }
    return undefined
  }
  const rec = asRecord(node)
  if (!rec) return undefined
  if (
    typeof rec.label === 'string' &&
    rec.label === wanted &&
    typeof rec.value === 'string' &&
    rec.value.trim()
  ) {
    return rec.value.trim()
  }
  for (const value of Object.values(rec)) {
    const found = findLabeledValue(value, wanted)
    if (found) return found
  }
  return undefined
}

function ownerFromLabelValues(labels: unknown[]): string | undefined {
  for (const item of labels) {
    const rec = asRecord(item)
    if (!rec) continue
    const title = readTitle(rec.title)
    if (title !== 'Owner') continue
    return (
      findLabeledValue(rec, 'Username') ?? findLabeledValue(rec, 'Name')
    )
  }
  return undefined
}

function pushHashtagName(raw: unknown, out: Set<string>): void {
  if (typeof raw !== 'string') return
  const tag = raw.replace(/^#+/, '').trim().toLowerCase()
  if (tag) out.add(tag)
}

function collectHashtagNames(node: unknown, out: Set<string>): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectHashtagNames(item, out)
    return
  }
  const rec = asRecord(node)
  if (!rec) return
  if (
    typeof rec.label === 'string' &&
    rec.label === 'Name' &&
    typeof rec.value === 'string'
  ) {
    pushHashtagName(rec.value, out)
  }
  for (const value of Object.values(rec)) {
    collectHashtagNames(value, out)
  }
}

function hashtagsFromLabelValues(labels: unknown[]): string[] | undefined {
  const tags = new Set<string>()
  for (const item of labels) {
    const rec = asRecord(item)
    if (!rec) continue
    if (readTitle(rec.title) !== 'Hashtags') continue
    collectHashtagNames(rec.dict ?? rec, tags)
  }
  return tags.size > 0 ? [...tags] : undefined
}

function collectLabelValues(node: Record<string, unknown>): ImportedPost | null {
  const labels = node.label_values
  if (!Array.isArray(labels)) return null

  const byLabel = new Map<string, { value?: string; href?: string }>()
  for (const item of labels) {
    const rec = asRecord(item)
    if (!rec || typeof rec.label !== 'string') continue
    // Prefer the first URL/Caption if Instagram repeats them (carousels).
    if (byLabel.has(rec.label)) continue
    byLabel.set(rec.label, {
      value: typeof rec.value === 'string' ? rec.value : undefined,
      href: typeof rec.href === 'string' ? rec.href : undefined,
    })
  }

  const urlEntry = byLabel.get('URL') ?? byLabel.get('Link') ?? byLabel.get('Permalink')
  const href = pickUrl(urlEntry?.href, urlEntry?.value)
  if (!href) return null

  const caption = byLabel.get('Caption')?.value ?? byLabel.get('Caption ')?.value
  const author =
    byLabel.get('Author')?.value ??
    byLabel.get('Username')?.value ??
    ownerFromLabelValues(labels)

  return {
    url: href,
    author,
    caption,
    hashtags: hashtagsFromLabelValues(labels),
    savedAt: timestampToMs(node.timestamp),
  }
}

function readTitle(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  const rec = asRecord(value)
  if (rec && typeof rec['utf-8'] === 'string') return rec['utf-8'] as string
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readTitle(item)
      if (nested) return nested
    }
  }
  return undefined
}

function walkNode(
  node: unknown,
  collection: string | undefined,
  out: ImportedPost[],
): void {
  if (node == null) return

  if (typeof node === 'string') {
    const urls = extractInstagramUrls(node)
    for (const url of urls) out.push({ url, collection })
    return
  }

  if (Array.isArray(node)) {
    for (const child of node) walkNode(child, collection, out)
    return
  }

  const rec = asRecord(node)
  if (!rec) return

  const title = readTitle(rec.title)

  const map = asRecord(rec.string_map_data)
  const isSavedMedia = Boolean(
    (map && (map['Saved on'] || map['Saved On'] || map.URL || map.href)) ||
      Array.isArray(rec.string_list_data),
  )

  // Media items use title as author; collection folders use title as collection name.
  const nextCollection =
    !isSavedMedia &&
    title &&
    !IG_URL_RE.test(title) &&
    !title.startsWith('http')
      ? title
      : collection

  const author = typeof rec.title === 'string' ? rec.title : undefined

  if (map) {
    const post = fromStringMapData(
      map,
      isSavedMedia ? author : undefined,
      isSavedMedia ? collection : nextCollection,
    )
    if (post) out.push(post)
  }

  if (Array.isArray(rec.string_list_data)) {
    out.push(
      ...fromStringListData(
        rec.string_list_data,
        author,
        isSavedMedia ? collection : nextCollection,
      ),
    )
  }

  const labeled = collectLabelValues(rec)
  if (labeled) {
    out.push({
      ...labeled,
      collection: labeled.collection ?? nextCollection,
      author: labeled.author,
    })
  }

  for (const [key, value] of Object.entries(rec)) {
    if (
      key === 'string_map_data' ||
      key === 'string_list_data' ||
      key === 'label_values'
    ) {
      continue
    }
    walkNode(value, nextCollection, out)
  }
}

function dedupePosts(posts: ImportedPost[]): ImportedPost[] {
  const byUrl = new Map<string, ImportedPost>()
  for (const post of posts) {
    const url = normalizeInstagramUrl(post.url)
    if (!url) continue
    const prev = byUrl.get(url)
    if (!prev) {
      byUrl.set(url, { ...post, url })
      continue
    }
    byUrl.set(url, {
      url,
      author: prev.author ?? post.author,
      caption: prev.caption ?? post.caption,
      hashtags: prev.hashtags ?? post.hashtags,
      collection: prev.collection ?? post.collection,
      savedAt: prev.savedAt ?? post.savedAt,
    })
  }
  return [...byUrl.values()]
}

export function parseInstagramExportJson(data: unknown): ImportedPost[] {
  const out: ImportedPost[] = []

  if (Array.isArray(data)) {
    walkNode(data, undefined, out)
    return dedupePosts(out)
  }

  const root = asRecord(data)
  if (!root) return []

  if (Array.isArray(root.saved_saved_media)) {
    walkNode(root.saved_saved_media, undefined, out)
  }
  if (Array.isArray(root.saved_saved_collections)) {
    walkNode(root.saved_saved_collections, undefined, out)
  }

  // Fall back to full recursive walk for newer label_values shapes
  walkNode(root, undefined, out)
  return dedupePosts(out)
}

export function parseInstagramExportHtml(html: string): ImportedPost[] {
  const out: ImportedPost[] = []
  const urls = extractInstagramUrls(html)
  for (const url of urls) out.push({ url })

  // Prefer anchor tags with href when DOMParser is available
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href')
        if (!href) continue
        const url = normalizeInstagramUrl(href)
        if (!url) continue
        const text = a.textContent?.trim()
        out.push({
          url,
          author: text && !text.startsWith('http') ? text : undefined,
        })
      }
    } catch {
      // regex fallback already applied
    }
  }

  return dedupePosts(out)
}

async function readTextFile(file: File): Promise<string> {
  return file.text()
}

function isLikelySavedPath(path: string): boolean {
  const lower = path.replace(/\\/g, '/').toLowerCase()
  return (
    lower.endsWith('saved_posts.json') ||
    lower.endsWith('saved_collections.json') ||
    lower.includes('/saved/') && lower.endsWith('.json') ||
    lower.includes('/saved/') && lower.endsWith('.html') ||
    /saved.*\.(json|html)$/i.test(lower)
  )
}

async function importFromZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file)
  const filesRead: string[] = []
  const posts: ImportedPost[] = []

  const names = Object.keys(zip.files)
  const preferred = [
    ...CANDIDATE_PATHS.filter((p) => names.some((n) => n.replace(/\\/g, '/').endsWith(p))),
    ...names.filter((n) => !zip.files[n]?.dir && isLikelySavedPath(n)),
  ]
  const unique = [...new Set(preferred)]

  for (const name of unique) {
    const fileEntry =
      zip.file(name) ??
      names
        .filter((n) => n.replace(/\\/g, '/').endsWith(name.replace(/\\/g, '/')))
        .map((n) => zip.file(n))
        .find(Boolean)

    if (!fileEntry || fileEntry.dir) continue
    const text = await fileEntry.async('string')
    filesRead.push(fileEntry.name)
    if (/\.html?$/i.test(fileEntry.name)) {
      posts.push(...parseInstagramExportHtml(text))
    } else {
      try {
        posts.push(...parseInstagramExportJson(JSON.parse(text)))
      } catch {
        posts.push(...parseInstagramExportHtml(text))
      }
    }
  }

  // If nothing matched by name, scan all json for instagram post urls
  if (posts.length === 0) {
    for (const name of names) {
      const entry = zip.file(name)
      if (!entry || entry.dir) continue
      if (!/\.(json|html?)$/i.test(name)) continue
      const text = await entry.async('string')
      if (!/instagram\.com\/(?:p|reel|tv)\//i.test(text)) continue
      filesRead.push(name)
      if (/\.html?$/i.test(name)) posts.push(...parseInstagramExportHtml(text))
      else {
        try {
          posts.push(...parseInstagramExportJson(JSON.parse(text)))
        } catch {
          posts.push(...extractInstagramUrls(text).map((url) => ({ url })))
        }
      }
    }
  }

  const imported = dedupePosts(posts)
  return {
    imported,
    skipped: 0,
    filesRead: [...new Set(filesRead)],
  }
}

export async function importInstagramFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.zip')) {
    return importFromZip(file)
  }

  const text = await readTextFile(file)
  let imported: ImportedPost[] = []

  if (name.endsWith('.html') || name.endsWith('.htm') || text.trimStart().startsWith('<')) {
    imported = parseInstagramExportHtml(text)
  } else {
    try {
      imported = parseInstagramExportJson(JSON.parse(text))
    } catch {
      imported = [
        ...extractInstagramUrls(text).map((url) => ({ url })),
        ...text
          .split(/\r?\n/)
          .map((line) => normalizeInstagramUrl(line))
          .filter((url): url is string => Boolean(url))
          .map((url) => ({ url })),
      ]
      imported = dedupePosts(imported)
    }
  }

  return {
    imported,
    skipped: 0,
    filesRead: [file.name],
  }
}

export function parsePastedLinks(text: string): ImportedPost[] {
  const fromUrls = extractInstagramUrls(text).map((url) => ({ url }))
  const fromLines = text
    .split(/\r?\n|,|\s+/)
    .map((part) => normalizeInstagramUrl(part))
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ url }))
  return dedupePosts([...fromUrls, ...fromLines])
}
