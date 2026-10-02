import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { DB_NAME } from './lib/storage'

async function resetStorage() {
  localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await resetStorage()
})

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('shows how to export every saved post', async () => {
    render(<App />)

    const steps = await screen.findByRole('list', { name: /export your saved posts/i })
    expect(within(steps).getByRole('link', { name: /export your information/i })).toHaveAttribute(
      'href',
      'https://accountscenter.instagram.com/info_and_permissions/dyi/',
    )
    expect(within(steps).getByText(/all time/i)).toBeInTheDocument()
    expect(within(steps).getByText(/saved_posts\.json/i)).toBeInTheDocument()
  })

  it('adds pasted links, draws, and marks completed', async () => {
    const user = userEvent.setup()
    render(<App />)

    const paste = await screen.findByLabelText(/paste links/i)
    await user.type(
      paste,
      'https://www.instagram.com/p/UiTestCode/\nhttps://www.instagram.com/reel/UiTestReel/',
    )
    await user.click(screen.getByRole('button', { name: /add links/i }))

    expect(await screen.findByText(/added 2 links/i)).toBeInTheDocument()
    expect(screen.getByText(/2 to do/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^draw$/i }))
    const drawn = screen.getByRole('article')
    expect(within(drawn).getByRole('link', { name: /open on instagram/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/instagram\.com\/(p|reel)\//),
    )

    await user.click(within(drawn).getByRole('button', { name: /^completed$/i }))
    expect(within(drawn).getByText('Completed', { selector: '.drawn-kicker' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /completed/i }))
    expect(screen.getByRole('list', { name: /^saved posts$/i })).toBeInTheDocument()
  })

  it('can undo wont do from the list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(
      await screen.findByLabelText(/paste links/i),
      'https://www.instagram.com/p/UndoMePlease/',
    )
    await user.click(screen.getByRole('button', { name: /add links/i }))

    const saves = () => screen.getByRole('list', { name: /^saved posts$/i })
    await user.click(within(await screen.findByRole('list', { name: /^saved posts$/i })).getByRole('button', { name: /won't do/i }))

    await user.click(screen.getByRole('tab', { name: /won't do/i }))
    const skipped = within(saves()).getByRole('listitem')
    await user.click(within(skipped).getByRole('button', { name: /undo/i }))

    await user.click(screen.getByRole('tab', { name: /to do/i }))
    expect(within(saves()).getByRole('listitem')).toBeInTheDocument()
  })

  it('waits for library load before showing zero saved', async () => {
    render(<App />)
    expect(screen.getByText(/loading saves/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 to do · 0 saved/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/0 to do · 0 saved/i)).toBeInTheDocument()
  })

  it('shows a quiet empty stats state before imports', async () => {
    render(<App />)
    const stats = await screen.findByRole('region', { name: /library stats/i })
    expect(within(stats).getByText(/import some saves to see patterns/i)).toBeInTheDocument()
    expect(within(stats).queryByText(/^0$/)).not.toBeInTheDocument()
  })
})
