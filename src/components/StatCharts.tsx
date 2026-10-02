import { useMemo, useState, type MouseEvent } from 'react'
import { chartsFromPosts, isReelUrl, type MonthBar, type CategorySlice } from '../lib/stats'
import type { SavedPost } from '../types'

const SLICE_COLORS = [
  '#1f7a6c',
  '#d4533a',
  '#2c4a5e',
  '#d0893a',
  '#6b4c9a',
  '#3d7ea6',
  '#8a5a44',
  '#c47b8a',
  '#9aa7b0',
]

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type RangePreset = 'all' | '12' | '36' | 'custom'

function monthIndex(year: number, month: number): number {
  return year * 12 + month
}

function parseMonthInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  if (month < 0 || month > 11) return null
  return monthIndex(year, month)
}

function toMonthInput(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function postMonthIndex(post: SavedPost): number | null {
  if (post.savedAt == null) return null
  const date = new Date(post.savedAt)
  return monthIndex(date.getFullYear(), date.getMonth())
}

export function LibraryCharts({ posts }: { posts: SavedPost[] }) {
  const hasReels = posts.some((post) => isReelUrl(post.url))
  const subject = hasReels ? 'reels' : 'saves'
  const subjectPosts = useMemo(
    () => (hasReels ? posts.filter((post) => isReelUrl(post.url)) : posts),
    [hasReels, posts],
  )

  const bounds = useMemo(() => {
    const indexes = subjectPosts
      .map(postMonthIndex)
      .filter((index): index is number => index != null)
    if (indexes.length === 0) return null
    return { min: Math.min(...indexes), max: Math.max(...indexes) }
  }, [subjectPosts])

  const [preset, setPreset] = useState<RangePreset>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const range = useMemo(() => {
    if (!bounds) return null
    if (preset === '12') return { start: bounds.max - 11, end: bounds.max }
    if (preset === '36') return { start: bounds.max - 35, end: bounds.max }
    if (preset === 'custom') {
      const start = parseMonthInput(from) ?? bounds.min
      const end = parseMonthInput(to) ?? bounds.max
      return start <= end ? { start, end } : { start: end, end: start }
    }
    return { start: bounds.min, end: bounds.max }
  }, [bounds, preset, from, to])

  const filtered = useMemo(() => {
    if (!range) return subjectPosts
    return subjectPosts.filter((post) => {
      const index = postMonthIndex(post)
      if (index == null) return false
      return index >= range.start && index <= range.end
    })
  }, [subjectPosts, range])

  const months = useMemo(() => {
    const series = chartsFromPosts(subjectPosts).reelsByMonth
    if (!range) return series
    return series.filter((month) => {
      const index = monthIndex(month.year, month.month)
      return index >= range.start && index <= range.end
    })
  }, [subjectPosts, range])
  const categories = useMemo(
    () => (filtered.length === 0 ? [] : chartsFromPosts(filtered).reelCategories),
    [filtered],
  )
  const noun = subject === 'reels' ? 'reels' : 'saves'

  return (
    <div className="charts">
      <div className="chart-card">
        <div className="chart-head">
          <div>
            <h3>{subject === 'reels' ? 'Reels saved per month' : 'Saves per month'}</h3>
            <p className="chart-note">
              {subject === 'reels'
                ? 'Hover a point to see how many reels you saved.'
                : 'None of these links are marked as reels, so this counts every save.'}
            </p>
          </div>
          <label className="range-control">
            <span>Range</span>
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
              aria-label="Chart date range"
            >
              <option value="all">All time</option>
              <option value="12">Last 12 months</option>
              <option value="36">Last 3 years</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        {preset === 'custom' && bounds ? (
          <div className="range-custom">
            <label>
              From
              <input
                type="month"
                value={from || toMonthInput(Math.floor(bounds.min / 12), bounds.min % 12)}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="month"
                value={to || toMonthInput(Math.floor(bounds.max / 12), bounds.max % 12)}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <MonthLine months={months} noun={noun} />
      </div>
      <CategoryPie slices={categories} noun={noun} />
    </div>
  )
}

function MonthLine({ months, noun }: { months: MonthBar[]; noun: string }) {
  const [active, setActive] = useState<number | null>(null)
  if (months.length === 0) {
    return <p className="empty-list">No dated saves in this range.</p>
  }

  const width = 640
  const height = 240
  const padLeft = 36
  const padRight = 12
  const padTop = 18
  const padBottom = 32
  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom
  const max = Math.max(...months.map((month) => month.count), 1)
  const xOf = (index: number) =>
    padLeft + (months.length === 1 ? innerW / 2 : (index / (months.length - 1)) * innerW)
  const yOf = (count: number) => padTop + innerH - (count / max) * innerH
  const points = months.map((month, index) => `${xOf(index)},${yOf(month.count)}`).join(' ')
  const labelEvery = Math.max(1, Math.ceil(months.length / 8))
  const activeMonth = active == null ? null : months[active]
  const tipLeft = active == null ? 0 : Math.min(88, Math.max(12, (xOf(active) / width) * 100))

  function move(event: MouseEvent<SVGSVGElement>) {
    const svg = event.currentTarget
    const matrix = svg.getScreenCTM()
    if (!matrix) return
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(matrix.inverse())
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    months.forEach((_, index) => {
      const distance = Math.abs(xOf(index) - local.x)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    setActive(nearest)
  }

  return (
    <div className="line-wrap">
      {activeMonth ? (
        <div className="chart-tip" style={{ left: `${tipLeft}%` }}>
          <strong>{activeMonth.label}</strong>
          <span>
            {activeMonth.count} {noun}
          </span>
        </div>
      ) : null}
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${noun} saved per month`}
        onMouseMove={move}
        onMouseLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((step) => {
          const value = Math.round(max * step)
          const y = yOf(value)
          return (
            <g key={step}>
              <line className="grid-line" x1={padLeft} x2={width - padRight} y1={y} y2={y} />
              <text className="axis-label" x={padLeft - 8} y={y + 4} textAnchor="end">
                {value}
              </text>
            </g>
          )
        })}
        <polyline className="line-path" points={points} />
        {active != null ? (
          <line
            className="hover-line"
            x1={xOf(active)}
            x2={xOf(active)}
            y1={padTop}
            y2={padTop + innerH}
          />
        ) : null}
        {months.map((month, index) => (
          <circle
            key={`${month.year}-${month.month}`}
            className={index === active ? 'line-dot is-active' : 'line-dot'}
            cx={xOf(index)}
            cy={yOf(month.count)}
            r={index === active ? 5 : 3.2}
          >
            <title>
              {month.label}: {month.count}
            </title>
          </circle>
        ))}
        {months.map((month, index) =>
          index % labelEvery === 0 || index === months.length - 1 ? (
            <text
              key={`label-${month.year}-${month.month}`}
              className="axis-label"
              x={xOf(index)}
              y={height - 8}
              textAnchor="middle"
            >
              {SHORT_MONTHS[month.month]} {String(month.year).slice(2)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

function CategoryPie({ slices, noun }: { slices: CategorySlice[]; noun: string }) {
  if (slices.length === 0) {
    return (
      <div className="chart-card">
        <h3>Reel categories</h3>
        <p className="empty-list">No captions or hashtags in this range.</p>
      </div>
    )
  }

  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="chart-card">
      <h3>{noun === 'reels' ? 'Reel categories' : 'Save categories'}</h3>
      <p className="chart-note">Guessed from hashtags and captions. Instagram doesn&apos;t send a category.</p>
      <div className="pie-layout">
        <svg className="pie-chart" viewBox="0 0 160 160" role="img" aria-label={`Categories of saved ${noun}`}>
          <g transform="rotate(-90 80 80)">
            {slices.map((slice, index) => {
              const length = (slice.count / total) * circumference
              const dash = slices.length === 1 ? `${circumference} 0` : `${Math.max(length - 1.2, 0)} ${circumference}`
              const circle = (
                <circle
                  key={slice.label}
                  cx={80}
                  cy={80}
                  r={radius}
                  fill="none"
                  stroke={SLICE_COLORS[index % SLICE_COLORS.length]}
                  strokeWidth={22}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                >
                  <title>
                    {slice.label}: {slice.count}
                  </title>
                </circle>
              )
              offset += length
              return circle
            })}
          </g>
          <text x="80" y="76" textAnchor="middle" className="pie-total">
            {total}
          </text>
          <text x="80" y="94" textAnchor="middle" className="pie-total-label">
            {noun}
          </text>
        </svg>
        <ul className="pie-legend">
          {slices.map((slice, index) => (
            <li key={slice.label}>
              <span className="pie-swatch" style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} />
              <span className="pie-name">{slice.label}</span>
              <span className="pie-count">{slice.count}</span>
              <span className="pie-pct">{Math.round((slice.count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
