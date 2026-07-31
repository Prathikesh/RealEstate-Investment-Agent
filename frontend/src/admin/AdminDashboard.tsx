import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Wifi, UserPlus, ChevronDown, ChevronUp, Compass, Eye, Calculator, Search,
  Download, Flame, ArrowUpRight, ArrowDownRight, Ban, CheckCircle2, MapPin,
  Building2, DollarSign,
} from 'lucide-react'
import clsx from 'clsx'
import {
  fetchAdminOverview, fetchAdminUsers, fetchAdminUserDetail, fetchActivityFeed, updateUserStatus,
  type UserSummary, type PropertyViewSummary, type ActivityEntry, type Engagement,
  type RankedLabel, type EngagementBreakdown,
} from './api'
import { friendlyPageName, friendlySearchSummary, timeAgo, describeEvent, downloadCsv } from './format'

// ── Small building blocks ────────────────────────────────────────────────────

function StatTile({ label, value, icon, trend, sparkline }: {
  label: string; value: number | string; icon: ReactNode
  trend?: { delta: number; suffix: string }
  sparkline?: number[]
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center text-accent shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold text-ink font-mono tabular-nums leading-tight">{value}</p>
            <p className="text-xs text-muted mt-0.5">{label}</p>
          </div>
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} />}
      </div>
      {trend && (
        <p className={clsx(
          'text-xs font-semibold mt-3 flex items-center gap-1',
          trend.delta > 0 ? 'text-score-strong' : trend.delta < 0 ? 'text-score-notrecommended' : 'text-muted',
        )}>
          {trend.delta > 0 ? <ArrowUpRight size={12} /> : trend.delta < 0 ? <ArrowDownRight size={12} /> : null}
          {trend.delta > 0 ? `+${trend.delta}` : trend.delta} {trend.suffix}
        </p>
      )}
    </div>
  )
}

/** Thin single-hue trend line — a decorative indicator embedded in a stat
 * tile, not a standalone chart, so it intentionally skips a hover layer. */
function Sparkline({ points, color = '#2563EB' }: { points: number[]; color?: string }) {
  const w = 76, h = 28
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const coords = points.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2] as const)
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = coords[coords.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}

/** Ranked magnitude list with a thin single-hue bar — "what's biggest", not identity. */
function RankedBarList({ items, empty }: { items: RankedLabel[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <ul className="space-y-2.5">
      {items.map(item => (
        <li key={item.label}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-ink font-medium truncate">{item.label}</span>
            <span className="text-muted font-mono shrink-0">{item.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

interface ListItem {
  key: string
  primary: string
  secondary?: string
  right?: string
}

function NumberedList({ items, empty }: { items: ListItem[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={item.key} className="flex items-start gap-3">
          <span className="text-xs font-bold text-muted/60 w-4 shrink-0 pt-0.5">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink font-medium truncate">{item.primary}</p>
            {item.secondary && <p className="text-xs text-muted truncate">{item.secondary}</p>}
          </div>
          {item.right && <span className="text-xs font-mono text-muted shrink-0 pt-0.5 whitespace-nowrap">{item.right}</span>}
        </li>
      ))}
    </ol>
  )
}

function propertyListItems(properties: PropertyViewSummary[], unit: string): ListItem[] {
  return properties.map(p => ({
    key: p.property_id,
    primary: p.full_address || 'Unknown address',
    secondary: p.city ? `${p.city}${p.score != null ? ` · Score ${p.score}` : ''}` : undefined,
    right: `${p.view_count} ${unit}`,
  }))
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {subtitle && <p className="text-xs text-muted mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  )
}

function ActivityFeed({ entries, showUser, empty }: { entries: ActivityEntry[]; showUser: boolean; empty: string }) {
  if (!entries.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
      {entries.map((e, i) => (
        <li key={i} className="flex items-start justify-between gap-3 text-sm">
          <p className="min-w-0 truncate">
            {showUser && <span className="text-ink font-medium">{(e.user_name || e.user_email) + ' '}</span>}
            <span className="text-muted">{describeEvent(e)}</span>
          </p>
          <span className="text-xs text-muted shrink-0 whitespace-nowrap pt-0.5">{timeAgo(e.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}

// Dot hexes are the app's own score/accent tokens (score-notrecommended,
// score-market, accent), validated as a 4-state status palette — see
// dataviz skill: CVD separation passes cleanly; "cold" is an intentional
// neutral (no-signal) state, always paired with a text label, never color-alone.
const ENGAGEMENT_META: Record<Engagement, { label: string; className: string; dot: string }> = {
  hot_lead:  { label: 'Hot lead',  className: 'bg-red-50 text-red-600',      dot: '#DC2626' },
  warm:      { label: 'Warm',      className: 'bg-amber-50 text-amber-700', dot: '#D97706' },
  exploring: { label: 'Exploring', className: 'bg-accent-light text-accent', dot: '#2563EB' },
  cold:      { label: 'Quiet',     className: 'bg-surface text-muted',      dot: '#94A3B8' },
}
const ENGAGEMENT_ORDER: Engagement[] = ['hot_lead', 'warm', 'exploring', 'cold']

function EngagementBadge({ tier }: { tier: Engagement }) {
  const m = ENGAGEMENT_META[tier]
  return <span className={clsx('px-2 py-0.5 rounded-md text-xs font-semibold', m.className)}>{m.label}</span>
}

/** Stacked composition bar — fixed category order/colors (never cycled), a
 * 2px surface gap between segments, direct-labeled legend underneath. */
function EngagementBar({ data }: { data: EngagementBreakdown }) {
  const total = data.hot_lead + data.warm + data.exploring + data.cold
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-surface">
        {ENGAGEMENT_ORDER.map(t => {
          const pct = total ? (data[t] / total) * 100 : 0
          if (!pct) return null
          return <div key={t} style={{ width: `${pct}%`, background: ENGAGEMENT_META[t].dot }} />
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3.5">
        {ENGAGEMENT_ORDER.map(t => (
          <div key={t} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ENGAGEMENT_META[t].dot }} />
            <span className="text-ink font-bold font-mono">{data[t]}</span>
            <span className="text-muted">{ENGAGEMENT_META[t].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Users table: search + filters + sort + pagination + export ─────────────

type SortKey = 'newest' | 'last_active' | 'viewed' | 'analyzed'
type EngagementFilter = Engagement | 'all'
type RoleFilter = 'all' | 'user' | 'admin'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest accounts' },
  { value: 'last_active', label: 'Last active' },
  { value: 'viewed', label: 'Properties viewed' },
  { value: 'analyzed', label: 'Financials calculated' },
]

const PAGE_SIZE = 12

function sortUsers(users: UserSummary[], sortBy: SortKey): UserSummary[] {
  const sorted = [...users]
  switch (sortBy) {
    case 'last_active':
      return sorted.sort((a, b) => new Date(b.last_active_at ?? 0).getTime() - new Date(a.last_active_at ?? 0).getTime())
    case 'viewed':
      return sorted.sort((a, b) => b.properties_viewed - a.properties_viewed)
    case 'analyzed':
      return sorted.sort((a, b) => b.properties_analyzed - a.properties_analyzed)
    default:
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}

function exportUsersCsv(users: UserSummary[]) {
  downloadCsv('plexa-users.csv', users.map(u => ({
    name: u.name || '',
    email: u.email,
    role: u.role,
    status: u.is_active ? 'Active' : 'Disabled',
    engagement: ENGAGEMENT_META[u.engagement].label,
    online: u.is_online ? 'Yes' : 'No',
    last_active: u.last_active_at || '',
    last_login: u.last_login_at || '',
    properties_viewed: u.properties_viewed,
    financials_calculated: u.properties_analyzed,
    most_used_page: u.top_page ? friendlyPageName(u.top_page) : '',
    signed_up: u.created_at,
  })))
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>('all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [page, setPage] = useState(1)

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: fetchAdminOverview,
    refetchInterval: 30_000,
  })

  const { data: feed } = useQuery({
    queryKey: ['admin-activity-feed'],
    queryFn: () => fetchActivityFeed(20),
    refetchInterval: 20_000,
  })

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
    refetchInterval: 30_000,
  })

  const activeUserItems: ListItem[] = (overview?.most_active_users ?? [])
    .map(u => ({ key: u.id, primary: u.name || u.email, right: `${u.event_count} actions` }))

  const pageItems: ListItem[] = (overview?.top_pages ?? [])
    .map(p => ({ key: p.path, primary: friendlyPageName(p.path), right: `${p.view_count} visits` }))

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (users ?? []).filter(u =>
      (!q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (roleFilter === 'all' || u.role === roleFilter) &&
      (engagementFilter === 'all' || u.engagement === engagementFilter) &&
      (!onlineOnly || u.is_online)
    )
    return sortUsers(filtered, sortBy)
  }, [users, query, sortBy, roleFilter, engagementFilter, onlineOnly])

  // Any filter change should snap back to page 1 — a stale page number on a
  // narrowed list silently shows "no results" even though matches exist.
  const resetAndSet = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE))
  const pagedUsers = visibleUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const signupDelta = overview ? overview.signups_this_week - overview.signups_last_week : 0
  const trendPoints = overview?.signup_trend?.map(p => p.count) ?? []

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">
      <div>
        <h1 className="text-2xl font-black text-ink">Admin Dashboard</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          A plain-English look at who&apos;s using Plexa: who&apos;s ready to convert, what they want,
          what they spend their time on, and who needs a nudge.
        </p>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="People with an account" value={overviewLoading ? '—' : overview?.total_users ?? 0} icon={<Users size={18} />} />
        <StatTile label="Online right now" value={overviewLoading ? '—' : overview?.online_now ?? 0} icon={<Wifi size={18} />} />
        <StatTile
          label="New accounts this week" value={overviewLoading ? '—' : overview?.signups_this_week ?? 0}
          icon={<UserPlus size={18} />} sparkline={trendPoints}
          trend={overview ? { delta: signupDelta, suffix: 'vs last week' } : undefined}
        />
        <StatTile
          label="Hot leads — ran the numbers 2+ times" value={overviewLoading ? '—' : overview?.engagement.hot_lead ?? 0}
          icon={<Flame size={18} />}
        />
      </div>

      {/* ── Engagement breakdown (now actually shown) ───────────────────── */}
      <Card title="Engagement" subtitle="How close each account is to a real buying decision">
        {overview ? <EngagementBar data={overview.engagement} /> : <p className="text-sm text-muted">Loading…</p>}
      </Card>

      {/* ── Business insight: what people actually want / search for ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="What people want" subtitle="Stated in Settings — cities, budgets, property types">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted mb-2"><MapPin size={12} /> Cities</p>
              <RankedBarList items={overview?.preferences.top_cities ?? []} empty="No one has set a city yet." />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted mb-2"><DollarSign size={12} /> Budget</p>
              <RankedBarList items={overview?.preferences.budget_bands ?? []} empty="No budgets set yet." />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted mb-2"><Building2 size={12} /> Property type</p>
              <RankedBarList items={overview?.preferences.property_types ?? []} empty="No types set yet." />
            </div>
          </div>
        </Card>
        <Card title="What people search for" subtitle="From actual searches, last ~300 — may differ from stated preferences">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted mb-2"><MapPin size={12} /> Cities searched</p>
              <RankedBarList items={overview?.top_search_cities ?? []} empty="No searches yet." />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted mb-2"><Building2 size={12} /> Types searched</p>
              <RankedBarList items={overview?.top_search_types ?? []} empty="No searches yet." />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Detailed breakdowns ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Most active people" subtitle="Who's done the most, this week">
          <NumberedList items={activeUserItems} empty="No activity yet." />
        </Card>
        <Card title="Most-visited pages" subtitle="Where people spend their time">
          <NumberedList items={pageItems} empty="No page views yet." />
        </Card>
        <Card title="Most-viewed properties" subtitle="What people are browsing">
          <NumberedList items={propertyListItems(overview?.most_viewed_properties ?? [], 'views')} empty="No property views yet." />
        </Card>
        <Card title="Most-analyzed properties" subtitle="What people actually ran the financials on">
          <NumberedList items={propertyListItems(overview?.most_analyzed_properties ?? [], 'analyses')} empty="No one has run a full analysis yet." />
        </Card>
      </div>

      {/* ── Users table ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="p-5 border-b border-surface-border space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">Everyone with an account</h2>
              <p className="text-xs text-muted mt-0.5">Click anyone to see exactly what they've been doing.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text" value={query} onChange={e => resetAndSet(setQuery)(e.target.value)}
                placeholder="Search name or email…"
                className="px-3 py-1.5 rounded-lg border border-surface-border text-xs w-44 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
                className="px-2 py-1.5 rounded-lg border border-surface-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={() => users && exportUsersCsv(visibleUsers)} disabled={!users?.length}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-xs font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40">
                <Download size={13} /> Export
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'hot_lead', 'warm', 'exploring', 'cold'] as EngagementFilter[]).map(v => (
              <button key={v} onClick={() => resetAndSet(setEngagementFilter)(v)}
                className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                  engagementFilter === v ? 'border-accent bg-accent-light text-accent' : 'border-surface-border text-muted hover:text-ink')}>
                {v === 'all' ? 'All' : ENGAGEMENT_META[v].label}
              </button>
            ))}
            <span className="w-px h-4 bg-surface-border mx-1" />
            {(['all', 'admin', 'user'] as RoleFilter[]).map(v => (
              <button key={v} onClick={() => resetAndSet(setRoleFilter)(v)}
                className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold border capitalize transition-colors',
                  roleFilter === v ? 'border-accent bg-accent-light text-accent' : 'border-surface-border text-muted hover:text-ink')}>
                {v}
              </button>
            ))}
            <span className="w-px h-4 bg-surface-border mx-1" />
            <button onClick={() => resetAndSet(setOnlineOnly)(!onlineOnly)}
              className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                onlineOnly ? 'border-accent bg-accent-light text-accent' : 'border-surface-border text-muted hover:text-ink')}>
              Online now
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-surface-border">
                <th className="px-5 py-3 font-semibold">Person</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Engagement</th>
                <th className="px-5 py-3 font-semibold">Last seen</th>
                <th className="px-5 py-3 font-semibold">Viewed</th>
                <th className="px-5 py-3 font-semibold">Analyzed</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">Loading…</td></tr>
              ) : !users?.length ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No one has signed up yet.</td></tr>
              ) : !visibleUsers.length ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No one matches these filters.</td></tr>
              ) : (
                pagedUsers.map(u => (
                  <UserRow
                    key={u.id}
                    user={u}
                    expanded={expandedUserId === u.id}
                    onToggle={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                    onStatusChanged={() => queryClient.invalidateQueries({ queryKey: ['admin-users'] })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {visibleUsers.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-surface-border">
            <p className="text-xs text-muted">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleUsers.length)} of {visibleUsers.length}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-surface-border text-xs font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                Previous
              </button>
              <span className="text-xs text-muted font-mono">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-surface-border text-xs font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Live activity — demoted to the bottom, secondary to the numbers ── */}
      <Card title="Live Activity" subtitle="What's happening right now, across everyone">
        <ActivityFeed entries={feed ?? []} showUser empty="Nothing's happened yet." />
      </Card>
    </div>
  )
}

function UserRow({ user, expanded, onToggle, onStatusChanged }: {
  user: UserSummary; expanded: boolean; onToggle: () => void; onStatusChanged: () => void
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin-user-detail', user.id],
    queryFn: () => fetchAdminUserDetail(user.id),
    enabled: expanded,
  })
  const [confirming, setConfirming] = useState(false)

  const statusMutation = useMutation({
    mutationFn: (is_active: boolean) => updateUserStatus(user.id, is_active),
    onSuccess: () => { setConfirming(false); onStatusChanged() },
  })

  function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (user.is_active && !confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    statusMutation.mutate(!user.is_active)
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className={clsx(
          'border-b border-surface-border last:border-0 hover:bg-surface-hover cursor-pointer transition-colors',
          !user.is_active && 'opacity-60',
        )}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp size={14} className="text-muted shrink-0" /> : <ChevronDown size={14} className="text-muted shrink-0" />}
            <span className={clsx('w-2 h-2 rounded-full shrink-0', user.is_online ? 'bg-score-strong' : 'bg-surface-border')} title={user.is_online ? 'Online now' : 'Offline'} />
            <div className="min-w-0">
              <p className="text-ink font-medium truncate">{user.name || user.email}</p>
              {user.name && <p className="text-xs text-muted truncate">{user.email}</p>}
            </div>
          </div>
        </td>
        <td className="px-5 py-3">
          <span className={clsx(
            'px-2 py-0.5 rounded-md text-xs font-semibold capitalize',
            user.role === 'admin' ? 'bg-accent-light text-accent' : 'bg-surface text-muted',
          )}>
            {user.role}
          </span>
        </td>
        <td className="px-5 py-3"><EngagementBadge tier={user.engagement} /></td>
        <td className="px-5 py-3 text-xs whitespace-nowrap">
          {user.is_online ? <span className="text-score-strong font-semibold">Online now</span> : <span className="text-muted">{timeAgo(user.last_active_at)}</span>}
        </td>
        <td className="px-5 py-3 text-ink font-mono">{user.properties_viewed}</td>
        <td className="px-5 py-3 text-ink font-mono">{user.properties_analyzed}</td>
        <td className="px-5 py-3">
          <button
            onClick={handleStatusClick}
            disabled={statusMutation.isPending}
            className={clsx(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50',
              user.is_active
                ? confirming
                  ? 'border-score-notrecommended bg-score-notrecommended/10 text-score-notrecommended'
                  : 'border-surface-border text-muted hover:text-score-notrecommended hover:border-score-notrecommended/40'
                : 'border-score-strong/40 bg-score-strong/10 text-score-strong hover:bg-score-strong/15',
            )}
          >
            {user.is_active
              ? confirming ? <><Ban size={12} /> Confirm?</> : <><CheckCircle2 size={12} /> Active</>
              : <><Ban size={12} /> Disabled</>}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface/60">
          <td colSpan={7} className="px-5 py-5">
            {isLoading ? (
              <p className="text-sm text-muted">Loading activity…</p>
            ) : !detail ? (
              <p className="text-sm text-muted">Couldn&apos;t load activity.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                <DetailSection icon={<Compass size={13} />} title="Pages visited most">
                  <NumberedList
                    items={detail.top_pages.map(p => ({ key: p.path, primary: friendlyPageName(p.path), right: `${p.view_count}×` }))}
                    empty="Hasn't browsed anywhere yet."
                  />
                </DetailSection>

                <DetailSection icon={<Eye size={13} />} title="Properties viewed">
                  <NumberedList items={propertyListItems(detail.viewed_properties, '×')} empty="Hasn't viewed any properties yet." />
                </DetailSection>

                <DetailSection icon={<Calculator size={13} />} title="Financials calculated on">
                  <NumberedList items={propertyListItems(detail.analyzed_properties, '×')} empty="Hasn't run the full financial analysis on anything yet." />
                </DetailSection>

                <DetailSection icon={<Search size={13} />} title="Recent searches">
                  <NumberedList
                    items={detail.recent_searches.map((s, i) => ({
                      key: `${i}`,
                      primary: friendlySearchSummary(s.filters),
                      right: timeAgo(s.created_at),
                    }))}
                    empty="Hasn't searched for anything yet."
                  />
                </DetailSection>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted mb-2">
        {icon}
        <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  )
}
