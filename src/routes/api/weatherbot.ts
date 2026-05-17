import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { requireLocalOrAuth } from '../../server/auth-middleware'

type JsonRecord = Record<string, unknown>

const WEATHERBOT_REPO_NAME = 'weatherbot-lab-20260513-214224'
const CANONICAL_WEATHERBOT_ROOT = '/home/ubuntu/coferlandia-vm/hermes/data/hermes-data/repos/weatherbot-lab-20260513-214224'
const TRACE_DIR = 'data/trace'
const MARKETS_DIR = 'data/markets'
const STATE_FILE = 'data/state.json'
const METRICS_FILE = `${TRACE_DIR}/metrics.json`
const DASHBOARD_FILE = `${TRACE_DIR}/dashboard.txt`
const EVENTS_FILE = `${TRACE_DIR}/events.jsonl`
const CAPITAL_HISTORY_FILE = `${TRACE_DIR}/capital_history.jsonl`
const DEFAULT_WEATHERBOT_SCAN_BASES = [
  '/root/hermes-data/repos',
  '/root/project/hermes-data/repos',
  '/root/project/hermes/data/hermes-data/repos',
  '/root/project/hermes-workspace',
  '/root/project',
  '/workspace',
  '/tmp',
  process.env.HOME?.trim(),
].filter((value): value is string => Boolean(value))

const WEATHERBOT_SCAN_ROOTS_ENV = 'WEATHERBOT_SCAN_ROOTS'

type WeatherbotRootResolution = {
  path: string
  source: string
}

function hasWeatherbotState(repoPath: string): boolean {
  return existsSync(join(repoPath, STATE_FILE)) && existsSync(join(repoPath, METRICS_FILE)) && existsSync(join(repoPath, DASHBOARD_FILE))
}

function parseScanRoots(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function collectWeatherbotCandidates(): Array<[string, string]> {
  const candidates = new Map<string, string>()
  const addCandidate = (candidatePath: string | undefined, source: string) => {
    if (!candidatePath) return
    const normalized = candidatePath.trim()
    if (!normalized || candidates.has(normalized)) return
    candidates.set(normalized, source)
  }

  const envCandidates: Array<[string, string | undefined]> = [
    ['env:WEATHERBOT_ROOT', process.env.WEATHERBOT_ROOT?.trim()],
    ['env:HERMES_WEATHERBOT_ROOT', process.env.HERMES_WEATHERBOT_ROOT?.trim()],
    ['env:WEATHERBOT_REPO_PATH', process.env.WEATHERBOT_REPO_PATH?.trim()],
  ]

  for (const [source, candidate] of envCandidates) {
    if (candidate) addCandidate(candidate, source)
  }

  addCandidate(CANONICAL_WEATHERBOT_ROOT, 'canonical-root')

  const scanBases = [...parseScanRoots(process.env[WEATHERBOT_SCAN_ROOTS_ENV]), ...DEFAULT_WEATHERBOT_SCAN_BASES]
  for (const base of scanBases) {
    addCandidate(base, `scan-base:${base}`)
    if (!existsSync(base)) continue

    let entries: Array<{ name: string; isDirectory: () => boolean }> = []
    try {
      entries = readdirSync(base, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const lower = entry.name.toLowerCase()
      if (lower === 'weatherbot' || lower.startsWith('weatherbot-')) {
        addCandidate(join(base, entry.name), `scan:${base}`)
      }
    }
  }

  return [...candidates.entries()]
}

function resolveWeatherbotRoot(): WeatherbotRootResolution {
  for (const [candidatePath, source] of collectWeatherbotCandidates()) {
    if (hasWeatherbotState(candidatePath)) {
      return { path: candidatePath, source }
    }
  }

  return { path: CANONICAL_WEATHERBOT_ROOT, source: 'canonical-root-default' }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function tailJsonLines(path: string, limit = 20): Array<JsonRecord> {
  const text = readText(path)
  if (!text) return []

  const lines = text.split(/\r?\n/).filter(Boolean)
  const slice = lines.slice(Math.max(0, lines.length - limit))
  const parsed: Array<JsonRecord> = []

  for (const line of slice) {
    try {
      parsed.push(JSON.parse(line) as JsonRecord)
    } catch {
      parsed.push({ raw: line })
    }
  }

  return parsed
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

function loadMarketFiles(repoPath: string): Array<JsonRecord> {
  const marketsPath = join(repoPath, MARKETS_DIR)
  if (!existsSync(marketsPath)) return []

  const markets: Array<JsonRecord> = []
  for (const fileName of readdirSync(marketsPath)) {
    if (!fileName.endsWith('.json')) continue
    const fullPath = join(marketsPath, fileName)
    try {
      markets.push(JSON.parse(readFileSync(fullPath, 'utf8')) as JsonRecord)
    } catch {
      // Ignore malformed market files; the dashboard should keep working.
    }
  }
  return markets
}

function parseCapitalSample(record: JsonRecord) {
  return {
    ts: typeof record.ts === 'string' ? record.ts : null,
    cashBalance: numberOrNull(record.cash_balance),
    reservedCapital: numberOrNull(record.reserved_capital),
    equityEstimate: numberOrNull(record.equity_estimate),
  }
}

function normalizeClosedPosition(market: JsonRecord, index: number) {
  const position = (market.position as JsonRecord | undefined) ?? {}
  const closeReason = typeof position.close_reason === 'string' ? position.close_reason : null
  return {
    id: `${String(market.city ?? 'unknown')}-${String(market.date ?? 'unknown')}-${index}`,
    city: market.city ?? null,
    cityName: market.city_name ?? null,
    date: market.date ?? null,
    bucket:
      position.bucket_low != null && position.bucket_high != null
        ? `${position.bucket_low}-${position.bucket_high}${market.unit === 'F' ? 'F' : 'C'}`
        : null,
    entryPrice: numberOrNull(position.entry_price),
    exitPrice: numberOrNull(position.exit_price),
    pnl: numberOrNull(position.pnl),
    cost: numberOrNull(position.cost),
    shares: numberOrNull(position.shares),
    closeReason,
    openedAt: typeof position.opened_at === 'string' ? position.opened_at : null,
    closedAt: typeof position.closed_at === 'string' ? position.closed_at : null,
    forecastSrc: typeof position.forecast_src === 'string' ? position.forecast_src : null,
    forecastTemp: numberOrNull(position.forecast_temp),
    question: typeof position.question === 'string' ? position.question : null,
    marketStatus: typeof market.status === 'string' ? market.status : null,
    resolvedOutcome: typeof market.resolved_outcome === 'string' ? market.resolved_outcome : null,
    outcomeLabel: closeReason ? closeReason.replace(/_/g, ' ') : 'unknown',
  }
}

export const Route = createFileRoute('/api/weatherbot')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } })
        }

        const { path: repoPath, source: repoSource } = resolveWeatherbotRoot()
        const statePath = join(repoPath, STATE_FILE)
        const metricsPath = join(repoPath, METRICS_FILE)
        const dashboardPath = join(repoPath, DASHBOARD_FILE)
        const eventsPath = join(repoPath, EVENTS_FILE)
        const capitalHistoryPath = join(repoPath, CAPITAL_HISTORY_FILE)

        if (
          !existsSync(repoPath) ||
          !existsSync(statePath) ||
          !existsSync(metricsPath) ||
          !existsSync(dashboardPath)
        ) {
          return json(
            {
              ok: false,
              error: 'weatherbot_root_not_found',
              message: `No se encontró el repo canónico de Weatherbot en ${repoPath}.`,
              source: {
                repoPath,
                statePath,
                metricsPath,
                dashboardPath,
                eventsPath,
                capitalHistoryPath,
                repoName: WEATHERBOT_REPO_NAME,
                repoSource,
              },
            },
            { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
          )
        }

        const state = readJson<JsonRecord>(statePath, {})
        const metrics = readJson<JsonRecord>(metricsPath, {})
        const events = tailJsonLines(eventsPath, 30)
        const capitalHistory = tailJsonLines(capitalHistoryPath, 120).map(parseCapitalSample)
        const closedPositions = loadMarketFiles(repoPath)
          .filter((market) => (market.position as JsonRecord | undefined)?.status === 'closed')
          .map((market, index) => normalizeClosedPosition(market, index))
          .sort((a, b) => {
            const aTs = a.closedAt ? Date.parse(a.closedAt) : 0
            const bTs = b.closedAt ? Date.parse(b.closedAt) : 0
            return bTs - aTs
          })
        const dashboardText = readText(dashboardPath)

        const updatedAtRaw =
          (metrics.updatedAt as string | undefined) ??
          (state.updatedAt as string | undefined) ??
          (state.updated_at as string | undefined) ??
          null
        const updatedAt = updatedAtRaw && !Number.isNaN(Date.parse(updatedAtRaw))
          ? new Date(updatedAtRaw).toISOString()
          : new Date(mtimeMs(dashboardPath) ?? Date.now()).toISOString()
        const updatedAtMs = Date.parse(updatedAt)
        const nowMs = Date.now()
        const ageMs = Number.isFinite(updatedAtMs) ? nowMs - updatedAtMs : null

        const freshness = {
          updatedAt,
          updatedAtMs,
          ageMs,
          stale: ageMs === null ? true : ageMs > 15 * 60 * 1000,
        }

        const stateRecord = state as JsonRecord
        const metricsState = (metrics.state as JsonRecord | undefined) ?? {}
        const stats = {
          startingBalance:
            numberOrNull(stateRecord.starting_balance) ??
            numberOrNull(metricsState.starting_balance) ??
            numberOrNull(stateRecord.balance) ??
            null,
          peakBalance:
            numberOrNull(stateRecord.peak_balance) ??
            numberOrNull(metricsState.peak_balance) ??
            null,
          cashBalance:
            numberOrNull(metrics.cash_balance) ??
            numberOrNull(state.balance) ??
            numberOrNull(state.cash_balance) ??
            null,
          equityEstimate:
            numberOrNull(metrics.equity_estimate) ??
            numberOrNull(state.equity_estimate) ??
            null,
          reservedCapital:
            numberOrNull(metrics.reserved_capital) ??
            numberOrNull(state.reserved_capital) ??
            null,
          unrealizedPnl:
            numberOrNull(metrics.unrealized_pnl) ??
            numberOrNull(state.unrealized_pnl) ??
            null,
          totalTradesOpened:
            numberOrNull(metrics.total_trades_opened) ??
            numberOrNull(state.total_trades_opened) ??
            null,
          wins: numberOrNull(metrics.wins) ?? numberOrNull(state.wins) ?? null,
          losses: numberOrNull(metrics.losses) ?? numberOrNull(state.losses) ?? null,
          openPositions:
            numberOrNull(metrics.open_positions) ??
            numberOrNull(state.open_positions) ??
            null,
          closedPositions:
            numberOrNull(metrics.closed_positions) ??
            numberOrNull(state.closed_positions) ??
            null,
          resolvedMarkets:
            numberOrNull(metrics.resolved_markets) ??
            numberOrNull(state.resolved_markets) ??
            null,
          totalMarkets:
            numberOrNull(metrics.total_markets) ??
            numberOrNull(state.total_markets) ??
            null,
        }

        const breakdowns = (metrics.breakdowns as JsonRecord | undefined) ?? {}
        const openPositions = (metrics.open_positions_list as Array<JsonRecord> | undefined) ?? []

        return json(
          {
            ok: true,
            checkedAt: nowMs,
            source: {
              repoPath,
              statePath,
              metricsPath,
              dashboardPath,
              eventsPath,
              capitalHistoryPath,
              repoName: WEATHERBOT_REPO_NAME,
              repoSource,
            },
            freshness,
            stats,
            breakdowns,
            openPositions,
            closedPositions,
            capitalHistory,
            recentEvents: events,
            dashboardText,
            files: {
              stateMtimeMs: mtimeMs(statePath),
              metricsMtimeMs: mtimeMs(metricsPath),
              dashboardMtimeMs: mtimeMs(dashboardPath),
              eventsMtimeMs: mtimeMs(eventsPath),
              eventsCountApprox: events.length,
            },
          },
          { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        )
      },
    },
  },
})
