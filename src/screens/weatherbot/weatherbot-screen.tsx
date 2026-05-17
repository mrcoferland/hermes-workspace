'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type JsonRecord = Record<string, unknown>

type CapitalSample = {
  ts: string | null
  cashBalance: number | null
  reservedCapital: number | null
  equityEstimate: number | null
}

type ClosedPosition = {
  id: string
  city: string | null
  cityName: string | null
  date: string | null
  bucket: string | null
  entryPrice: number | null
  exitPrice: number | null
  pnl: number | null
  cost: number | null
  shares: number | null
  closeReason: string | null
  openedAt: string | null
  closedAt: string | null
  forecastSrc: string | null
  forecastTemp: number | null
  question: string | null
  marketStatus: string | null
  resolvedOutcome: string | null
  outcomeLabel: string
}

type WeatherbotPayload = {
  ok: boolean
  checkedAt: number
  source: {
    repoPath: string
    statePath: string
    metricsPath: string
    dashboardPath: string
    eventsPath: string
    capitalHistoryPath: string
    repoName: string
    repoSource: string
  }
  freshness: {
    updatedAt: string | null
    updatedAtMs: number | null
    ageMs: number | null
    stale: boolean
  }
  stats: {
    startingBalance: number | null
    peakBalance: number | null
    cashBalance: number | null
    equityEstimate: number | null
    reservedCapital: number | null
    unrealizedPnl: number | null
    totalTradesOpened: number | null
    wins: number | null
    losses: number | null
    openPositions: number | null
    closedPositions: number | null
    resolvedMarkets: number | null
    totalMarkets: number | null
  }
  breakdowns: JsonRecord
  openPositions: Array<JsonRecord>
  closedPositions: ClosedPosition[]
  capitalHistory: CapitalSample[]
  recentEvents: Array<JsonRecord>
  dashboardText: string | null
  files: {
    stateMtimeMs: number | null
    metricsMtimeMs: number | null
    dashboardMtimeMs: number | null
    eventsMtimeMs: number | null
    eventsCountApprox: number
  }
}

type CapitalPoint = {
  ts: string | null
  label: string
  cashBalance: number | null
  reservedCapital: number | null
  equityEstimate: number | null
}

const REFRESH_MS = 30_000
const SESSION_HEADER = 'X-Hermes-Session-Token'

async function fetchJSON<T>(url: string): Promise<T> {
  const headers = new Headers()
  const token = window.__HERMES_SESSION_TOKEN__
  if (token) headers.set(SESSION_HEADER, token)
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function formatSignedNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatAge(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { hour12: false })
}

function formatChartTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return '—'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function humanizeReason(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function statusTone(payload: WeatherbotPayload): string {
  if (payload.freshness.stale) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-white/45">{hint}</div> : null}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function StatusPill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

function CapitalTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
      <div className="font-medium text-white/80">{label ?? '—'}</div>
      <div className="mt-2 space-y-1 text-white/70">
        <div>Reserved: {formatMoney(payload[0]?.value ?? null)}</div>
        <div>Equity: {formatMoney(payload[1]?.value ?? null)}</div>
      </div>
    </div>
  )
}

export function WeatherbotScreen() {
  const [payload, setPayload] = useState<WeatherbotPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setError(null)
        const data = await fetchJSON<WeatherbotPayload & {
          error?: string
          message?: string
        }>(`/api/weatherbot?ts=${Date.now()}`)
        if (!data.ok) {
          throw new Error(data.message || data.error || 'weatherbot fetch failed')
        }
        if (!cancelled) {
          setPayload(data)
          setLoading(false)
          setNowMs(Date.now())
        }
      } catch (cause) {
        if (cancelled) return
        setPayload(null)
        setLoading(false)
        setError(cause instanceof Error ? cause.message : 'weatherbot fetch failed')
      }
    }

    void load()
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
      void load()
    }, REFRESH_MS)

    const handleVisibility = () => {
      setNowMs(Date.now())
      if (document.visibilityState === 'visible') {
        void load()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const capitalSeries = useMemo<CapitalPoint[]>(() => {
    if (!payload) return []
    return payload.capitalHistory
      .filter((sample) => sample.ts)
      .map((sample) => ({
        ts: sample.ts,
        label: formatChartTimestamp(sample.ts),
        cashBalance: sample.cashBalance,
        reservedCapital: sample.reservedCapital,
        equityEstimate: sample.equityEstimate,
      }))
  }, [payload])

  const capitalSummary = useMemo(() => {
    if (!payload) return null
    const reservedValues = capitalSeries.map((point) => point.reservedCapital).filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    )
    const currentEquity =
      payload.stats.equityEstimate ?? capitalSeries.at(-1)?.equityEstimate ?? payload.stats.cashBalance ?? null
    const startingBalance = payload.stats.startingBalance ?? capitalSeries.at(0)?.cashBalance ?? null
    const gainPct =
      typeof currentEquity === 'number' && typeof startingBalance === 'number' && startingBalance > 0
        ? ((currentEquity - startingBalance) / startingBalance) * 100
        : null
    const averageReserved =
      reservedValues.length > 0
        ? reservedValues.reduce((sum, value) => sum + value, 0) / reservedValues.length
        : null
    const minReserved = reservedValues.length > 0 ? Math.min(...reservedValues) : null
    const maxReserved = reservedValues.length > 0 ? Math.max(...reservedValues) : null
    const minSample = capitalSeries.find((point) => point.reservedCapital === minReserved) ?? null
    const maxSample = capitalSeries.find((point) => point.reservedCapital === maxReserved) ?? null

    return {
      currentEquity,
      startingBalance,
      gainPct,
      averageReserved,
      minReserved,
      maxReserved,
      minSample,
      maxSample,
    }
  }, [payload, capitalSeries])

  const summary = useMemo(() => {
    if (!payload) return null
    const liveAgeMs =
      typeof payload.freshness.updatedAtMs === 'number'
        ? Math.max(0, nowMs - payload.freshness.updatedAtMs)
        : payload.freshness.ageMs
    return {
      updated: formatTimestamp(payload.freshness.updatedAt),
      age: formatAge(liveAgeMs),
      staleLabel: payload.freshness.stale ? 'Stale' : 'Fresh',
    }
  }, [payload, nowMs])

  if (loading && !payload) {
    return (
      <div className="mx-auto flex min-h-full max-w-7xl items-center justify-center px-4 py-12 text-white/70">
        Loading Weatherbot dashboard…
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)]" data-plugin-surface="weatherbot">
        <Section title="Weatherbot" subtitle="Could not load the workspace surface.">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        </Section>
      </div>
    )
  }

  if (!payload) return null

  const totalEvents = payload.files.eventsCountApprox
  const openPositions = payload.openPositions
  const closedPositions = payload.closedPositions

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)]" data-plugin-surface="weatherbot">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/20 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Weatherbot</h1>
            <StatusPill className={statusTone(payload)}>
              {summary?.staleLabel ?? '—'} · updated {summary?.age ?? '—'} ago
            </StatusPill>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            File-backed cockpit for the weather trading lab. Reads <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/85">metrics.json</code>, <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/85">dashboard.txt</code>, <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/85">events.jsonl</code> and capital history directly from the lab repo.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
            <StatusPill className="border-white/10 bg-white/5 text-white/70">Repo: {payload.source.repoPath}</StatusPill>
            <StatusPill className="border-white/10 bg-white/5 text-white/70">Checked: {summary?.updated ?? '—'}</StatusPill>
            <StatusPill className="border-white/10 bg-white/5 text-white/70">Events: {formatNumber(totalEvents)}</StatusPill>
          </div>
        </div>
        <div className="grid gap-2 text-xs text-white/50 md:min-w-[320px]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 font-mono break-all">{payload.source.metricsPath}</div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 font-mono break-all">{payload.source.dashboardPath}</div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 font-mono break-all">{payload.source.eventsPath}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Initial capital" value={formatMoney(capitalSummary?.startingBalance)} hint="Seed capital from state.json" />
        <MetricCard label="Current gain" value={formatPercent(capitalSummary?.gainPct)} hint="Equity vs. starting capital" />
        <MetricCard label="Average invested capital" value={formatMoney(capitalSummary?.averageReserved)} hint="Average reserved capital" />
        <MetricCard label="Reserved capital" value={formatMoney(payload.stats.reservedCapital)} hint="Capital parked in open positions" />
        <MetricCard label="Min invested capital" value={formatMoney(capitalSummary?.minReserved)} hint={capitalSummary?.minSample?.ts ? formatChartTimestamp(capitalSummary.minSample.ts) : '—'} />
        <MetricCard label="Max invested capital" value={formatMoney(capitalSummary?.maxReserved)} hint={capitalSummary?.maxSample?.ts ? formatChartTimestamp(capitalSummary.maxSample.ts) : '—'} />
        <MetricCard label="Cash balance" value={formatMoney(payload.stats.cashBalance)} />
        <MetricCard label="Equity estimate" value={formatMoney(payload.stats.equityEstimate)} />
      </div>

      <div className="mt-6">
        <Section
          title="Capital evolution"
          subtitle="Reserved capital and equity estimate over time, like a simple market chart."
        >
          {capitalSeries.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-white/60">
                <StatusPill className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                  Samples: {capitalSeries.length}
                </StatusPill>
                <StatusPill className="border-white/10 bg-white/5 text-white/70">
                  Current equity: {formatMoney(capitalSummary?.currentEquity)}
                </StatusPill>
                <StatusPill className="border-white/10 bg-white/5 text-white/70">
                  Peak balance: {formatMoney(payload.stats.peakBalance)}
                </StatusPill>
              </div>
              <div className="h-80 rounded-2xl border border-white/10 bg-black/20 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={capitalSeries}>
                    <defs>
                      <linearGradient id="capitalReservedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="capitalEquityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} width={70} />
                    <Tooltip content={<CapitalTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="reservedCapital"
                      name="Reserved capital"
                      stroke="#10b981"
                      fill="url(#capitalReservedFill)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="equityEstimate"
                      name="Equity estimate"
                      stroke="#38bdf8"
                      fill="url(#capitalEquityFill)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/55">
              No capital history found yet.
            </div>
          )}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Section title="Open positions" subtitle="Pulled from the latest metrics snapshot.">
          {openPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.14em] text-white/40">
                  <tr>
                    <th className="pb-3 pr-4">City</th>
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Bucket</th>
                    <th className="pb-3 pr-4">Entry → now</th>
                    <th className="pb-3 pr-4">PnL</th>
                    <th className="pb-3 pr-4">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((position, index) => {
                    const key = `${asText(position.city)}-${asText(position.date)}-${index}`
                    return (
                      <tr key={key} className="border-t border-white/8">
                        <td className="py-3 pr-4 font-medium text-white">{asText(position.city)}</td>
                        <td className="py-3 pr-4 text-white/65">{asText(position.date)}</td>
                        <td className="py-3 pr-4 text-white/65">{asText(position.bucket)}</td>
                        <td className="py-3 pr-4 text-white/65">
                          {formatNumber(position.entry_price as number | null)} → {formatNumber(position.current_price as number | null)}
                        </td>
                        <td className="py-3 pr-4 text-white/65">{formatSignedNumber(position.unrealized_pnl as number | null)}</td>
                        <td className="py-3 pr-4 text-white/65">{asText(position.forecast_src)} {formatNumber(position.forecast_temp as number | null)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/55">
              No open positions in the current snapshot.
            </div>
          )}
        </Section>

        <Section title="Closed positions" subtitle="Exit reason, gain/loss and the main trade details.">
          {closedPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.14em] text-white/40">
                  <tr>
                    <th className="pb-3 pr-4">City</th>
                    <th className="pb-3 pr-4">Reason</th>
                    <th className="pb-3 pr-4">Entry → Exit</th>
                    <th className="pb-3 pr-4">PnL</th>
                    <th className="pb-3 pr-4">Opened / Closed</th>
                    <th className="pb-3 pr-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((position) => (
                    <tr key={position.id} className="border-t border-white/8 align-top">
                      <td className="py-3 pr-4 font-medium text-white">
                        <div>{position.cityName ?? position.city ?? '—'}</div>
                        <div className="text-xs text-white/45">{position.date ?? '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-white/65">{humanizeReason(position.closeReason)}</td>
                      <td className="py-3 pr-4 text-white/65">
                        {formatNumber(position.entryPrice)} → {formatNumber(position.exitPrice)}
                      </td>
                      <td className={`py-3 pr-4 font-medium ${typeof position.pnl === 'number' && position.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatSignedNumber(position.pnl)}
                      </td>
                      <td className="py-3 pr-4 text-white/65">
                        <div>{formatTimestamp(position.openedAt)}</div>
                        <div className="text-xs text-white/45">{formatTimestamp(position.closedAt)}</div>
                      </td>
                      <td className="py-3 pr-4 text-white/65">
                        <div>Cost: {formatMoney(position.cost)}</div>
                        <div>Shares: {formatNumber(position.shares)}</div>
                        <div>Forecast: {asText(position.forecastSrc)} {formatNumber(position.forecastTemp)}</div>
                        <div className="text-xs text-white/45">{position.bucket ?? '—'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/55">
              No closed positions in the current snapshot.
            </div>
          )}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Section title="Breakdowns" subtitle="Compact view of the latest snapshot.">
          <div className="space-y-4 text-sm text-white/70">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Markets by city</div>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5">{JSON.stringify(payload.breakdowns.markets_by_city ?? {}, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Open positions by city</div>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5">{JSON.stringify(payload.breakdowns.open_positions_by_city ?? {}, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Closed reasons</div>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5">{JSON.stringify(payload.breakdowns.closed_reasons ?? {}, null, 2)}</pre>
            </div>
          </div>
        </Section>

        <Section title="Recent events" subtitle={`Latest ${payload.recentEvents.length} events from events.jsonl`}>
          <div className="space-y-3">
            {payload.recentEvents.length > 0 ? (
              payload.recentEvents.map((event, index) => (
                <div key={`${asText(event.ts)}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                    <span className="font-mono">{asText(event.ts)}</span>
                    <span>{asText(event.event)}</span>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-white/70">{JSON.stringify(event, null, 2)}</pre>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/55">
                No recent events found.
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Section title="Raw dashboard" subtitle="The text file the bot writes on every refresh.">
          <pre className="max-h-[36rem] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-white/75 whitespace-pre-wrap">
            {payload.dashboardText || 'No dashboard.txt found.'}
          </pre>
        </Section>

        <Section title="System context" subtitle="Location metadata and file freshness.">
          <div className="space-y-4 text-sm text-white/70">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Files</div>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5">{JSON.stringify(payload.files, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">Paths</div>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5">{JSON.stringify(payload.source, null, 2)}</pre>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
