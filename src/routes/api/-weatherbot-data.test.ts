import fs from 'node:fs/promises'
import path from 'node:path'
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

async function seedWeatherbotRoot(root: string) {
  await fs.mkdir(path.join(root, 'data/trace'), { recursive: true })
  await fs.mkdir(path.join(root, 'data/markets'), { recursive: true })

  await fs.writeFile(
    path.join(root, 'data/state.json'),
    JSON.stringify(
      {
        balance: 11445.32,
        starting_balance: 10000,
        peak_balance: 11561.17,
      },
      null,
      2,
    ),
    'utf8',
  )

  await fs.writeFile(
    path.join(root, 'data/trace/metrics.json'),
    JSON.stringify(
      {
        updatedAt: '2026-05-15T04:06:10.674815+00:00',
        cash_balance: 11445.32,
        equity_estimate: 11561.17,
        reserved_capital: 100,
        unrealized_pnl: 15.85,
        total_trades_opened: 41,
        wins: 8,
        losses: 3,
        open_positions: 1,
        closed_positions: 2,
        resolved_markets: 3,
        total_markets: 59,
        breakdowns: {
          markets_by_city: { atlanta: 1 },
          open_positions_by_city: { atlanta: 1 },
          closed_reasons: { stop_loss: 1, take_profit: 1 },
        },
        open_positions_list: [],
      },
      null,
      2,
    ),
    'utf8',
  )

  await fs.writeFile(path.join(root, 'data/trace/dashboard.txt'), 'dashboard', 'utf8')
  await fs.writeFile(
    path.join(root, 'data/trace/events.jsonl'),
    [
      JSON.stringify({ ts: '2026-05-15T03:00:00Z', event: 'scan_started' }),
      JSON.stringify({ ts: '2026-05-15T04:00:00Z', event: 'scan_finished' }),
    ].join('\n') + '\n',
    'utf8',
  )
  await fs.writeFile(
    path.join(root, 'data/trace/capital_history.jsonl'),
    [
      JSON.stringify({ ts: '2026-05-15T03:00:00Z', cash_balance: 11300, reserved_capital: 80, equity_estimate: 11390 }),
      JSON.stringify({ ts: '2026-05-15T04:00:00Z', cash_balance: 11445.32, reserved_capital: 100, equity_estimate: 11561.17 }),
    ].join('\n') + '\n',
    'utf8',
  )

  await fs.writeFile(
    path.join(root, 'data/markets/atlanta_2026-05-14.json'),
    JSON.stringify(
      {
        city: 'atlanta',
        city_name: 'Atlanta',
        date: '2026-05-14',
        unit: 'F',
        status: 'closed',
        position: {
          status: 'closed',
          market_id: '2237399',
          bucket_low: 72,
          bucket_high: 73,
          entry_price: 0.22,
          exit_price: 0.17,
          pnl: -4.55,
          cost: 20,
          shares: 90.91,
          close_reason: 'stop_loss',
          opened_at: '2026-05-13T21:46:22.546787+00:00',
          closed_at: '2026-05-14T00:35:29.963859+00:00',
          forecast_src: 'hrrr',
          forecast_temp: 73,
        },
        resolved_outcome: null,
      },
      null,
      2,
    ),
    'utf8',
  )
}

describe('weatherbot route data', () => {
  it('returns capital history and closed position details from the canonical root', async () => {
    vi.resetModules()
    const root = path.join('/tmp', `weatherbot-api-${Date.now()}`)
    await seedWeatherbotRoot(root)
    const previousRoot = process.env.WEATHERBOT_ROOT
    process.env.WEATHERBOT_ROOT = root

    try {
      const mod = await import('./weatherbot')
      const get = (mod as any).Route.server.handlers.GET

      const res = await get({
        request: new Request('http://localhost/api/weatherbot'),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.source.repoPath).toBe(root)
      expect(data.source.repoName).toBe('weatherbot-lab-20260513-214224')
      expect(data.stats.startingBalance).toBe(10000)
      expect(data.files.eventsCountApprox).toBe(2)
      expect(data.capitalHistory).toHaveLength(2)
      expect(data.closedPositions).toHaveLength(1)
      expect(data.closedPositions[0]).toMatchObject({
        city: 'atlanta',
        closeReason: 'stop_loss',
        pnl: -4.55,
      })
    } finally {
      if (previousRoot === undefined) delete process.env.WEATHERBOT_ROOT
      else process.env.WEATHERBOT_ROOT = previousRoot
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('discovers a weatherbot root from scan bases when env overrides are missing', async () => {
    vi.resetModules()
    const base = path.join('/tmp', `weatherbot-scan-${Date.now()}`)
    const root = path.join(base, 'weatherbot')
    await seedWeatherbotRoot(root)

    const previousRoot = process.env.WEATHERBOT_ROOT
    const previousScanRoots = process.env.WEATHERBOT_SCAN_ROOTS
    delete process.env.WEATHERBOT_ROOT
    process.env.WEATHERBOT_SCAN_ROOTS = base

    try {
      const mod = await import('./weatherbot')
      const get = (mod as any).Route.server.handlers.GET

      const res = await get({
        request: new Request('http://localhost/api/weatherbot'),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.source.repoPath).toBe(root)
      expect(data.source.repoSource).toBe(`scan:${base}`)
      expect(data.stats.startingBalance).toBe(10000)
    } finally {
      if (previousRoot === undefined) delete process.env.WEATHERBOT_ROOT
      else process.env.WEATHERBOT_ROOT = previousRoot
      if (previousScanRoots === undefined) delete process.env.WEATHERBOT_SCAN_ROOTS
      else process.env.WEATHERBOT_SCAN_ROOTS = previousScanRoots
      await fs.rm(base, { recursive: true, force: true })
    }
  })
})
