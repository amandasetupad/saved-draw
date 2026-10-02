const POST_PATH =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.-]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i

const BARE_SHORTCODE = /^\/?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?/i

export function extractInstagramUrls(text: string): string[] {
  const found = new Set<string>()
  const re =
    /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.-]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/gi
  for (const match of text.matchAll(re)) {
    const normalized = normalizeInstagramUrl(match[0])
    if (normalized) found.add(normalized)
  }
  return [...found]
}

export function normalizeInstagramUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let match = trimmed.match(POST_PATH)
  if (!match) {
    match = trimmed.match(BARE_SHORTCODE)
  }
  if (!match) return null

  const kind = match[1].toLowerCase() === 'tv' ? 'tv' : match[1].toLowerCase().startsWith('reel') ? 'reel' : 'p'
  const shortcode = match[2]
  return `https://www.instagram.com/${kind}/${shortcode}/`
}

export function shortcodeFromUrl(url: string): string | null {
  const normalized = normalizeInstagramUrl(url)
  if (!normalized) return null
  const match = normalized.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)\//i)
  return match?.[1] ?? null
}

export function postIdFromUrl(url: string): string | null {
  const shortcode = shortcodeFromUrl(url)
  return shortcode ? shortcode.toLowerCase() : null
}
