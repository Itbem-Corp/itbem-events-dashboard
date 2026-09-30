import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Preview } from './main'

const network = vi.hoisted(() => vi.fn(() => { throw new Error('Synthetic preview must not contact a backend') }))
vi.mock('@/lib/api', () => ({ api: { get: network, post: network, put: network, delete: network } }))

afterEach(() => vi.unstubAllGlobals())

describe('synthetic agent experience preview', () => {
  it('renders the real synthetic component fixture without backend or browser network access', () => {
    network.mockClear()
    vi.stubGlobal('fetch', network)
    vi.stubGlobal('XMLHttpRequest', network)
    render(<Preview />)
    expect(screen.getByText('Una confirmación, sin duplicados')).toBeInTheDocument()
    expect(network).not.toHaveBeenCalled()
  })
})
