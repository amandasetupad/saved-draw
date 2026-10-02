import { useCallback, useEffect, useMemo, useState } from 'react'
import { drawRandom } from './lib/draw'
import { importInstagramFile, parsePastedLinks } from './lib/import'
import { LibraryCharts } from './components/StatCharts'
import { computeLibraryStats } from './lib/stats'
import {
  loadPosts,
  mergeImportedPosts,
  removePost,
  savePosts,
  setPostStatus,
  storageErrorMessage,
} from './lib/storage'
import type { DrawPool, ListFilter, SavedPost } from './types'
import './App.css'

function statusLabel(status: SavedPost['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'wont_do') return "Won't do"
  return 'To do'
}

function formatWhen(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function breakableHandle(author: string): string {
  return `@${author}`.replace(/([._])/g, '$1\u200b')
}

export default function App() {
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [ready, setReady] = useState(false)
  const [filter, setFilter] = useState<ListFilter>('todo')
  const [drawPool, setDrawPool] = useState<DrawPool>('todo')
  const [drawn, setDrawn] = useState<SavedPost | null>(null)
  const [paste, setPaste] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadPosts()
        if (cancelled) return
        setPosts(loaded)
        setReady(true)
      } catch (err) {
        if (cancelled) return
        setMessage(storageErrorMessage(err))
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      try {
        await savePosts(posts)
      } catch (err) {
        if (!cancelled) setMessage(storageErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [posts, ready])

  const counts = useMemo(() => {
    return {
      all: posts.length,
      todo: posts.filter((p) => p.status === 'todo').length,
      completed: posts.filter((p) => p.status === 'completed').length,
      wont_do: posts.filter((p) => p.status === 'wont_do').length,
    }
  }, [posts])

  const stats = useMemo(() => computeLibraryStats(posts), [posts])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return posts.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false
      if (!q) return true
      return (
        p.url.toLowerCase().includes(q) ||
        p.shortcode.toLowerCase().includes(q) ||
        (p.author?.toLowerCase().includes(q) ?? false) ||
        (p.caption?.toLowerCase().includes(q) ?? false) ||
        (p.collection?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [posts, filter, search])

  const flash = useCallback((text: string) => {
    setMessage(text)
  }, [])

  const handleDraw = () => {
    if (!ready) return
    const pick = drawRandom(posts, drawPool)
    setDrawn(pick)
    if (!pick) {
      flash(
        drawPool === 'todo'
          ? 'Nothing left to do — import posts or draw from everything.'
          : 'No posts yet — import a download or paste links.',
      )
    }
  }

  const mark = (id: string, status: SavedPost['status']) => {
    setPosts((prev) => setPostStatus(prev, id, status))
    setDrawn((current) =>
      current && current.id === id ? { ...current, status } : current,
    )
  }

  const handleImportFile = async (file: File | null) => {
    if (!file || !ready) return
    setBusy(true)
    try {
      const result = await importInstagramFile(file)
      const { posts: next, added, updated } = mergeImportedPosts(
        posts,
        result.imported,
        'export',
      )
      setPosts(next)
      flash(
        result.imported.length === 0
          ? `No Instagram post links found in ${file.name}.`
          : `Imported ${result.imported.length} posts (${added} new, ${updated} refreshed). Marks kept.`,
      )
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const handlePaste = () => {
    if (!ready) return
    const imported = parsePastedLinks(paste)
    if (imported.length === 0) {
      flash('Paste Instagram post or reel URLs first.')
      return
    }
    const { posts: next, added, updated } = mergeImportedPosts(
      posts,
      imported,
      'manual',
    )
    setPosts(next)
    setPaste('')
    flash(`Added ${imported.length} link${imported.length === 1 ? '' : 's'} (${added} new, ${updated} already known).`)
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />

      <header className="top">
        <p className="brand">Saved Draw</p>
        <p className="tag">
          {ready
            ? `${counts.todo} to do · ${counts.all} saved`
            : 'Loading saves…'}
        </p>
      </header>

      {!ready ? (
        <main>
          <p className="empty-list" role="status">
            Loading your saved posts…
          </p>
        </main>
      ) : (
        <main>
          <section className="panel start-panel" aria-labelledby="add-heading">
            <h2 id="add-heading">Start here</h2>
            <p className="hint">
              Instagram doesn&apos;t let a website read your private Saved page. Download
              every saved post in one export, then import the file here. That works
              for a thousand or more.
            </p>
            <ol className="steps" aria-label="Export your saved posts">
              <li>
                Open{' '}
                <a
                  href="https://accountscenter.instagram.com/info_and_permissions/dyi/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Accounts Center → Export your information
                </a>
                . From the app: Settings and activity → Accounts Center → Your
                information and permissions → Export your information.
              </li>
              <li>
                Choose <strong>Create export</strong>, then <strong>Export to device</strong>.
              </li>
              <li>
                Select only <strong>Saved</strong>. Skip photos, messages, and the
                rest so the file stays small.
              </li>
              <li>
                Set the date range to <strong>All time</strong> and the format to{' '}
                <strong>JSON</strong>.
              </li>
              <li>
                Request the export and wait for the email. It often arrives within
                an hour.
              </li>
              <li>
                Drop the ZIP on <strong>Import download</strong>. Or unzip it and
                import <code>your_instagram_activity/saved/saved_posts.json</code>.
              </li>
            </ol>
            <p className="hint">
              Paste links is only for adding a few by hand. Importing again keeps
              any Completed or Won&apos;t do marks.
            </p>

            <div className="add-grid">
              <label className="file-card">
                <span className="file-title">Import download</span>
                <span className="file-sub">
                  ZIP, saved_posts.json, or HTML from Instagram&apos;s data export
                </span>
                <input
                  type="file"
                  accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
                  disabled={busy}
                  onChange={(e) => {
                    void handleImportFile(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </label>

              <div className="paste-card">
                <label htmlFor="paste">Paste links</label>
                <textarea
                  id="paste"
                  rows={4}
                  placeholder="https://www.instagram.com/p/…&#10;https://www.instagram.com/reel/…"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <button type="button" onClick={handlePaste} disabled={!paste.trim()}>
                  Add links
                </button>
              </div>
            </div>

            {message ? (
              <p className="message" role="status">
                {message}
              </p>
            ) : null}
          </section>


          <section className="draw-stage" aria-labelledby="draw-heading">
            <h1 id="draw-heading">Draw one</h1>
            <p className="lede">
              Pick at random from your Instagram saves. Mark done or skip — your
              list stays in this browser.
            </p>

            <div className="draw-controls">
              <label className="pool">
                <span>Pool</span>
                <select
                  value={drawPool}
                  onChange={(e) => setDrawPool(e.target.value as DrawPool)}
                >
                  <option value="todo">Still to do ({counts.todo})</option>
                  <option value="all">Everything ({counts.all})</option>
                </select>
              </label>
              <button type="button" className="draw-btn" onClick={handleDraw}>
                Draw
              </button>
            </div>

            {drawn ? (
              <article className="drawn" key={drawn.id}>
                <p className="drawn-kicker">{statusLabel(drawn.status)}</p>
                <h2>
                  {drawn.author ? `@${drawn.author}` : drawn.shortcode}
                </h2>
                {drawn.collection ? (
                  <p className="meta">Collection · {drawn.collection}</p>
                ) : null}
                {drawn.caption ? (
                  <p className="caption">{drawn.caption}</p>
                ) : null}
                <a className="open" href={drawn.url} target="_blank" rel="noreferrer">
                  Open on Instagram
                </a>
                <div className="actions">
                  <button type="button" onClick={() => mark(drawn.id, 'completed')}>
                    Completed
                  </button>
                  <button type="button" onClick={() => mark(drawn.id, 'wont_do')}>
                    Won&apos;t do
                  </button>
                  {drawn.status !== 'todo' ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => mark(drawn.id, 'todo')}
                    >
                      Undo
                    </button>
                  ) : null}
                  <button type="button" className="ghost" onClick={handleDraw}>
                    Draw again
                  </button>
                </div>
              </article>
            ) : (
              <div className="drawn empty">
                <p>Press Draw when you&apos;re ready.</p>
              </div>
            )}
          </section>

          <section className="panel stats-panel" aria-labelledby="stats-heading">
            <h2 id="stats-heading">Library stats</h2>
            <p className="hint">
              Patterns across every saved post in this browser — including
              completed and won&apos;t do.
            </p>
            {posts.length === 0 ? (
              <p className="empty-list">Import some saves to see patterns here.</p>
            ) : (
              <>
              <ul className="stats-grid">
                <li className="stat-oldest">
                  <p className="stats-label">Oldest save</p>
                  {stats.oldest ? (
                    <>
                      <a href={stats.oldest.url} target="_blank" rel="noreferrer">
                        {stats.oldest.author
                          ? breakableHandle(stats.oldest.author)
                          : stats.oldest.shortcode}
                      </a>
                      <p className="stats-detail">
                        Saved {formatWhen(stats.oldest.savedAt)}
                      </p>
                    </>
                  ) : (
                    <p className="stats-value muted">No save dates yet</p>
                  )}
                </li>
                <li className="stat-word">
                  <p className="stats-label">Top word</p>
                  {stats.topWord ? (
                    <>
                      <p className="stats-value">{stats.topWord.value}</p>
                      <p className="stats-detail">
                        {stats.topWord.count} time
                        {stats.topWord.count === 1 ? '' : 's'} in descriptions
                      </p>
                    </>
                  ) : (
                    <p className="stats-value muted">No description text yet</p>
                  )}
                </li>
                <li className="stat-month">
                  <p className="stats-label">Busiest month</p>
                  {stats.busiestMonth ? (
                    <>
                      <p className="stats-value">{stats.busiestMonth.label}</p>
                      <p className="stats-detail">
                        {stats.busiestMonth.count} save
                        {stats.busiestMonth.count === 1 ? '' : 's'}
                      </p>
                    </>
                  ) : (
                    <p className="stats-value muted">No save dates yet</p>
                  )}
                </li>
                <li className="stat-tag">
                  <p className="stats-label">Popular hashtag</p>
                  {stats.topHashtag ? (
                    <>
                      <p className="stats-value">{stats.topHashtag.value}</p>
                      <p className="stats-detail">
                        in {stats.topHashtag.count} post
                        {stats.topHashtag.count === 1 ? '' : 's'}
                      </p>
                    </>
                  ) : (
                    <p className="stats-value muted">No hashtags found</p>
                  )}
                </li>
              </ul>
              <LibraryCharts posts={posts} />
              </>
            )}
          </section>

          <section className="panel list-panel" aria-labelledby="list-heading">
            <div className="list-head">
              <h2 id="list-heading">All saves</h2>
              <input
                type="search"
                placeholder="Search author, caption, code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search saves"
              />
            </div>

            <div className="filters" role="tablist" aria-label="Filter by status">
              {(
                [
                  ['todo', `To do (${counts.todo})`],
                  ['all', `All (${counts.all})`],
                  ['completed', `Completed (${counts.completed})`],
                  ['wont_do', `Won't do (${counts.wont_do})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={filter === value ? 'active' : undefined}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="empty-list">No posts in this view yet.</p>
            ) : (
              <ul className="post-list" aria-label="Saved posts">
                {visible.map((post) => (
                  <li key={post.id} className={`post status-${post.status}`}>
                    <div className="post-main">
                      <a href={post.url} target="_blank" rel="noreferrer">
                        {post.author ? `@${post.author}` : post.shortcode}
                      </a>
                      <p className="post-meta">
                        <span>{statusLabel(post.status)}</span>
                        {post.collection ? <span>{post.collection}</span> : null}
                        {post.savedAt ? (
                          <span>Saved {formatWhen(post.savedAt)}</span>
                        ) : (
                          <span>Added {formatWhen(post.addedAt)}</span>
                        )}
                      </p>
                      {post.caption ? (
                        <p className="post-caption">{post.caption}</p>
                      ) : null}
                    </div>
                    <div className="post-actions">
                      {post.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => mark(post.id, 'completed')}
                        >
                          Completed
                        </button>
                      ) : null}
                      {post.status !== 'wont_do' ? (
                        <button
                          type="button"
                          onClick={() => mark(post.id, 'wont_do')}
                        >
                          Won&apos;t do
                        </button>
                      ) : null}
                      {post.status !== 'todo' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => mark(post.id, 'todo')}
                        >
                          Undo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => setPosts((prev) => removePost(prev, post.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
