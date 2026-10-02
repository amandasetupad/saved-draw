export type PostStatus = 'todo' | 'completed' | 'wont_do'

export type PostSource = 'export' | 'manual'

export interface SavedPost {
  id: string
  url: string
  shortcode: string
  author?: string
  caption?: string
  /** Hashtag names without a leading #, lowercased when imported. */
  hashtags?: string[]
  collection?: string
  savedAt?: number
  status: PostStatus
  source: PostSource
  addedAt: number
  updatedAt: number
}

export interface ImportedPost {
  url: string
  author?: string
  caption?: string
  /** Hashtag names without a leading #. */
  hashtags?: string[]
  collection?: string
  savedAt?: number
}

export interface ImportResult {
  imported: ImportedPost[]
  skipped: number
  filesRead: string[]
}

export type ListFilter = 'all' | 'todo' | 'completed' | 'wont_do'

export type DrawPool = 'todo' | 'all'
