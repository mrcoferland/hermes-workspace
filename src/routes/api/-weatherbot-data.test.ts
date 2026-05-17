import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('@tanstack/react-start', () => ({
  json: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...(init || {}),
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    }),
}))

vi.mock('../../server/auth-middleware', () => ({
  requireLocalOrAuth: () => true,
}))

describe('weatherbot route data', () => {
  it('returns capital history and closed position details from the canonical root', async () => {
    vi.resetModules()
    const mod = await import('./weatherbot')
    const get = (mod as any).Route.server.handlers.GET

    const res = await get({
      request: new Request('http://localhost/api/weatherbot'),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.source.repoPath).toBe('/root/hermes-data/repos/weatherbot')
    expect(data.source.repoName).toBe('weatherbot')
    expect(data.source.repoSource).toBe('canonical-root')
    expect(data.stats.startingBalance).toBeGreaterThan(0)
    expect(data.files.eventsCountApprox).toBeGreaterThanOrEqual(0)
    expect(data.capitalHistory.length).toBeGreaterThan(0)
    expect(data.closedPositions.length).toBeGreaterThanOrEqual(0)
  })
})
