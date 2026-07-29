import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users, Wifi, UserPlus, ChevronDown, ChevronUp, Compass, Eye, Calculator, Search,
  Activity, Download,
} from 'lucide-react'
import clsx from 'clsx'
import {
  fetchAdminOverview, fetchAdminUsers, fetchAdminUserDetail, fetchActivityFeed,
  type UserSummary, type PropertyViewSummary, type ActivityEntry, type Engagement,
} from './api'
import { friendlyPageName, friendlySearchSummary, timeAgo, describeEvent, downloadCsv } from './format'

// ── Small building blocks ────────────────────────────────────────────────────

function StatTile({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center text-accent shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-ink font-mono tabular-nums leading-tight">{value}</p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    </div>
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

const ENGAGEMENT_META: Record<Engagement, { label: string; className: string }> = {
  hot_lead:  { label: 'Hot lead',  className: 'bg-red-50 text-red-600' },
  warm:      { label: 'Warm',      className: 'bg-amber-50 text-amber-700' },
  exploring: { label: 'Exploring', className: 'bg-accent-light text-accent' },
  cold:      { label: 'Quiet',     className: 'bg-surface text-muted' },
}

function EngagementBadge({ engagement }: { engagement: Engagement }) {
  const meta = ENGAGEMENT_META[engagement]
  return <span className={clsx('px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap', meta.className)}>{meta.label}</span>
}

// ── Users table: search + sort + export ─────────────────────────────────────

type SortKey = 'newest' | 'last_active' | 'viewed' | 'analyzed'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest accounts' },
  { value: 'last_active', label: 'Last active' },
  { value: 'viewed', label: 'Properties viewed' },
  { value: 'analyzed', label: 'Financials calculated' },
]

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
  downloadCsv('arpent-users.csv', users.map(u => ({
    name: u.name || '',
    email: u.email,
    role: u.role,
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

function exportUserActivityCsv(user: UserSummary, activity: ActivityEntry[]) {
  const stem = (user.name || user.email).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  downloadCsv(`arpent-activity-${stem}.csv`, activity.map(e => ({
    when: e.created_at,
    action: describeEvent(e),
    type: e.event_type,
  })))
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('newest')

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
      !q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
    return sortUsers(filtered, sortBy)
  }, [users, query, sortBy])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">
      <div>
        <h1 className="text-2xl font-black text-ink">Admin Dashboard</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          A plain-English look at who&apos;s using Arpent: who&apos;s active right now, what they spend the
          most time on, which properties get looked at, and which ones people actually run the numbers on.
        </p>
      </div>

      {/* ── Live activity ────────────────────────────────────────────────── */}
      <Card title="Live Activity" subtitle="What's happening right now, across everyone">
        <ActivityFeed entries={feed ?? []} showUser empty="Nothing's happened yet." />
      </Card>

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="People with an account" value={overviewLoading ? '—' : overview?.total_users ?? 0} icon={<Users size={18} />} />
        <StatTile label="Online right now" value={overviewLoading ? '—' : overview?.online_now ?? 0} icon={<Wifi size={18} />} />
        <StatTile label="New accounts this week" value={overviewLoading ? '—' : overview?.signups_this_week ?? 0} icon={<UserPlus size={18} />} />
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
        <div className="p-5 border-b border-surface-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Everyone with an account</h2>
            <p className="text-xs text-muted mt-0.5">Click anyone to see exactly what they've been doing.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="px-3 py-1.5 rounded-lg border border-surface-border text-xs w-44 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              className="px-2 py-1.5 rounded-lg border border-surface-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => users && exportUsersCsv(users)}
              disabled={!users?.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-xs font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40"
            >
              <Download size={13} /> Export
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
                <th className="px-5 py-3 font-semibold">Properties viewed</th>
                <th className="px-5 py-3 font-semibold">Financials calculated</th>
                <th className="px-5 py-3 font-semibold">Spends time on</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">Loading…</td></tr>
              ) : !users?.length ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No one has signed up yet.</td></tr>
              ) : !visibleUsers.length ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No one matches &quot;{query}&quot;.</td></tr>
              ) : (
                visibleUsers.map(u => (
                  <UserRow
                    key={u.id}
                    user={u}
                    expanded={expandedUserId === u.id}
                    onToggle={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function UserRow({ user, expanded, onToggle }: { user: UserSummary; expanded: boolean; onToggle: () => void }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin-user-detail', user.id],
    queryFn: () => fetchAdminUserDetail(user.id),
    enabled: expanded,
  })

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-surface-border last:border-0 hover:bg-surface-hover cursor-pointer transition-colors"
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
        <td className="px-5 py-3"><EngagementBadge engagement={user.engagement} /></td>
        <td className="px-5 py-3 text-xs whitespace-nowrap">
          {user.is_online ? <span className="text-score-strong font-semibold">Online now</span> : <span className="text-muted">{timeAgo(user.last_active_at)}</span>}
        </td>
        <td className="px-5 py-3 text-ink font-mono">{user.properties_viewed}</td>
        <td className="px-5 py-3 text-ink font-mono">{user.properties_analyzed}</td>
        <td className="px-5 py-3 text-muted text-xs">{user.top_page ? friendlyPageName(user.top_page) : '—'}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface/60">
          <td colSpan={7} className="px-5 py-5">
            {isLoading ? (
              <p className="text-sm text-muted">Loading activity…</p>
            ) : !detail ? (
              <p className="text-sm text-muted">Couldn&apos;t load activity.</p>
            ) : (
              <div className="space-y-5">
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Activity size={13} />
                      <p className="text-xs font-bold uppercase tracking-wide">Recent activity, in order</p>
                    </div>
                    <button
                      onClick={() => exportUserActivityCsv(user, detail.recent_activity)}
                      className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink transition-colors"
                    >
                      <Download size={12} /> Export
                    </button>
                  </div>
                  <ActivityFeed entries={detail.recent_activity} showUser={false} empty="No recent activity." />
                </div>
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
