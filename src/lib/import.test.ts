import { describe, expect, it } from 'vitest'
import {
  parseInstagramExportHtml,
  parseInstagramExportJson,
  parsePastedLinks,
} from './import'

describe('parseInstagramExportJson', () => {
  it('parses saved_saved_media string_map_data', () => {
    const data = {
      saved_saved_media: [
        {
          title: 'baker',
          string_map_data: {
            'Saved on': {
              href: 'https://www.instagram.com/p/AbcDef1/',
              timestamp: 1700000000,
            },
          },
        },
      ],
    }
    const posts = parseInstagramExportJson(data)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      url: 'https://www.instagram.com/p/AbcDef1/',
      author: 'baker',
      savedAt: 1700000000000,
    })
  })

  it('parses string_list_data', () => {
    const data = {
      saved_saved_media: [
        {
          title: 'chef',
          string_list_data: [
            {
              href: 'https://www.instagram.com/reel/ReelCode/',
              timestamp: 1710000000,
            },
          ],
        },
      ],
    }
    const posts = parseInstagramExportJson(data)
    expect(posts[0]?.url).toBe('https://www.instagram.com/reel/ReelCode/')
    expect(posts[0]?.author).toBe('chef')
  })

  it('walks label_values recursively', () => {
    const data = [
      {
        title: [{ 'utf-8': 'Recipes' }],
        label_values: [
          { label: 'URL', href: 'https://www.instagram.com/p/LabelPost/' },
          { label: 'Caption', value: 'try this' },
          { label: 'Author', value: 'home cook' },
        ],
      },
    ]
    const posts = parseInstagramExportJson(data)
    expect(posts).toEqual([
      expect.objectContaining({
        url: 'https://www.instagram.com/p/LabelPost/',
        caption: 'try this',
        author: 'home cook',
        collection: 'Recipes',
      }),
    ])
  })

  it('parses current Instagram saved_posts label_values with Owner', () => {
    const data = [
      {
        timestamp: 1700000000,
        media: [],
        label_values: [
          {
            label: 'URL',
            value: 'https://www.instagram.com/reel/CurrFmt1/',
            href: 'https://www.instagram.com/reel/CurrFmt1/',
          },
          { label: 'Caption', value: 'floating flowers' },
          { label: 'Title', value: '' },
          { dict: [], title: 'Hashtags' },
          {
            title: 'Owner',
            dict: [
              {
                title: '',
                dict: [
                  { label: 'URL', value: '' },
                  { label: 'Name', value: 'Garden Studio' },
                  { label: 'Username', value: 'garden.studio' },
                ],
              },
            ],
          },
          { dict: [], title: 'Brand partner' },
        ],
      },
    ]
    const posts = parseInstagramExportJson(data)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      url: 'https://www.instagram.com/reel/CurrFmt1/',
      caption: 'floating flowers',
      author: 'garden.studio',
      savedAt: 1700000000000,
    })
  })

  it('stores description and hashtags from label_values', () => {
    const data = [
      {
        timestamp: 1700000000,
        label_values: [
          {
            label: 'URL',
            href: 'https://www.instagram.com/p/TagPost1/',
            value: 'https://www.instagram.com/p/TagPost1/',
          },
          { label: 'Caption', value: 'Weekend bake #home' },
          {
            title: 'Hashtags',
            dict: [
              { title: '', dict: [{ label: 'Name', value: 'Sourdough' }] },
              { title: '', dict: [{ label: 'Name', value: 'Bread' }] },
            ],
          },
          {
            title: 'Owner',
            dict: [
              {
                title: '',
                dict: [{ label: 'Username', value: 'oven.notes' }],
              },
            ],
          },
        ],
      },
    ]
    const posts = parseInstagramExportJson(data)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.caption).toBe('Weekend bake #home')
    expect(posts[0]?.hashtags?.sort()).toEqual(['bread', 'sourdough'])
    expect(posts[0]?.author).toBe('oven.notes')
  })
})

describe('parseInstagramExportHtml', () => {
  it('extracts anchor hrefs', () => {
    const html = `
      <a href="https://www.instagram.com/p/HtmlPost/">someone</a>
      <a href="https://example.com/nope">skip</a>
    `
    expect(parseInstagramExportHtml(html)).toEqual([
      expect.objectContaining({
        url: 'https://www.instagram.com/p/HtmlPost/',
        author: 'someone',
      }),
    ])
  })
})

describe('parsePastedLinks', () => {
  it('dedupes pasted urls', () => {
    const text = `
      https://www.instagram.com/p/SameCode/
      https://instagram.com/p/SameCode/?hl=en
      https://www.instagram.com/reel/OtherOne/
    `
    const posts = parsePastedLinks(text)
    expect(posts.map((p) => p.url).sort()).toEqual([
      'https://www.instagram.com/p/SameCode/',
      'https://www.instagram.com/reel/OtherOne/',
    ])
  })
})
