import { Link } from 'react-router-dom'
import { ArrowRight, Zap, Bell, BarChart2, Map, ShieldCheck } from 'lucide-react'
import { AppIcon } from '../components/QuartisLogo'

// ── Static data ───────────────────────────────────────────────────────────────

const FEATURES = [
  { Icon: Zap,      label: 'AI Deal Scoring'   },
  { Icon: Bell,     label: 'Market Alerts'      },
  { Icon: BarChart2, label: 'Cap Rate Financials' },
  { Icon: Map,      label: 'Interactive Map'    },
]

const STATS = [
  { value: '445+', label: 'Properties tracked' },
  { value: '4',    label: 'Live data sources'  },
  { value: '80',   label: 'Best deal score'    },
  { value: 'QC',   label: 'Market focus'       },
]

const DIST = [
  { pct: 3,  color: '#059669', label: 'Strong Buy'      },
  { pct: 10, color: '#2563EB', label: 'Worth Checking'  },
  { pct: 30, color: '#D97706', label: 'Fair Price'      },
  { pct: 57, color: '#DC2626', label: 'Not Recommended' },
]

const MOCK_PROPS = [
  {
    score:    80,
    verdict:  'Buy It',
    color:    '#059669',
    price:    '$1,039,000',
    type:     'Triplex · Ville-Marie',
    address:  '1195–1197 Rue Saint-Hubert',
    metrics:  [['4.62%', 'Cap Rate'], ['-$618/mo', 'Cash Flow'], ['+19.8%', 'vs Market']],
  },
  {
    score:    74,
    verdict:  'Worth Checking',
    color:    '#2563EB',
    price:    '$749,900',
    type:     'Duplex · Hochelaga',
    address:  '606–608 Rue Paul-Pau',
    metrics:  [['4.26%', 'Cap Rate'], ['-$670/mo', 'Cash Flow'], ['+24.9%', 'vs Market']],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function MockPropertyCard({
  score, verdict, color, price, type, address, metrics,
}: typeof MOCK_PROPS[number]) {
  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
      {/* Photo placeholder — dark gradient with building silhouette */}
      <div
        className="h-24 relative"
        style={{ background: `linear-gradient(135deg, #0f1623 0%, #182136 55%, #101826 100%)` }}
      >
        <div className="absolute inset-0 flex items-end justify-center pb-3 opacity-15">
          <AppIcon size={36} className="text-white" />
        </div>
        {/* Score pill */}
        <div
          className="absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg"
          style={{ background: color }}
        >
          {score}
        </div>
        {/* Verdict */}
        <div
          className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg text-white text-[11px] font-bold backdrop-blur-sm"
          style={{ background: color + 'CC' }}
        >
          {verdict}
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3 space-y-2">
        <div>
          <p className="text-white font-bold text-base font-mono tabular-nums">{price}</p>
          <p className="text-white/50 text-xs mt-0.5">{type} · {address}</p>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {metrics.map(([v, l]) => (
            <div key={l} className="bg-white/6 rounded-lg px-2 py-1.5 text-center">
              <p className="text-white text-[11px] font-bold">{v}</p>
              <p className="text-white/35 text-[9px] mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row overflow-hidden"
      style={{ background: '#07090f' }}
    >

      {/* ════════════════════════════════════════════════════════════
          LEFT — brand + headline + CTA
          ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col justify-center px-10 py-16 lg:px-16 xl:px-24 relative overflow-hidden">

        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-[480px] h-[480px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)' }} />
        <div className="pointer-events-none absolute bottom-0 left-1/3 w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />

        {/* Subtle dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

        <div className="relative space-y-9 max-w-lg">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center shadow-2xl"
              style={{ boxShadow: '0 0 40px rgba(37,99,235,0.4)' }}>
              <AppIcon size={20} className="text-white" />
            </div>
            <div>
              <span className="text-white text-xl font-black tracking-tight">Arpent</span>
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest leading-tight">
                Québec Real Estate Intelligence
              </p>
            </div>
          </div>

          {/* Live badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-white/60 text-xs font-semibold">
              Live · 445 properties · Updated daily
            </span>
          </div>

          {/* Hero headline */}
          <div>
            <h1 className="text-5xl xl:text-[3.75rem] font-black text-white leading-[1.02] tracking-tight">
              Find the best<br />
              real estate deals<br />
              <span style={{ color: '#3b82f6' }}>in Québec.</span>
            </h1>
            <p className="text-white/45 mt-4 text-base xl:text-lg leading-relaxed">
              AI analyses every listing for cap rate, market price, and
              investment potential — so you don't have to.
            </p>
          </div>

          {/* Feature chips */}
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/4"
              >
                <Icon size={14} className="text-accent shrink-0" />
                <span className="text-white/70 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-7 py-5 border-y border-white/8">
            {STATS.map(s => (
              <div key={s.label}>
                <p className="text-white font-black text-2xl font-mono tabular-nums leading-tight">{s.value}</p>
                <p className="text-white/35 text-[11px] font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: '#2563EB',
                boxShadow: '0 0 30px rgba(37,99,235,0.5), 0 4px 12px rgba(37,99,235,0.3)',
              }}
            >
              Enter Dashboard
              <ArrowRight size={15} />
            </Link>
            <Link
              to="/properties"
              className="text-white/45 hover:text-white/80 text-sm font-semibold transition-colors duration-150 flex items-center gap-1.5"
            >
              Browse listings
              <ArrowRight size={13} />
            </Link>
          </div>

          {/* Trust line */}
          <div className="flex items-center gap-2 text-white/25 text-xs">
            <ShieldCheck size={12} />
            <span>Data from Realtor.ca · Centris · ReMax Québec · Proprio Direct</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          RIGHT — dashboard preview panel
          ════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex w-[440px] xl:w-[520px] shrink-0 flex-col justify-center px-8 py-14 relative overflow-hidden"
        style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute top-1/4 right-4 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />

        <div className="relative space-y-4">

          {/* Preview header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/45 text-xs font-semibold uppercase tracking-widest">Live Opportunities</span>
            </div>
            <Link to="/properties" className="text-white/30 hover:text-white/60 text-xs font-medium transition-colors">
              View all →
            </Link>
          </div>

          {/* Score distribution */}
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs font-semibold">Score Distribution</span>
              <span className="text-white/30 text-[10px]">445 properties</span>
            </div>
            <div className="h-2 rounded-full flex overflow-hidden gap-px">
              {DIST.map(d => (
                <div
                  key={d.label}
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${d.pct}%`, background: d.color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-4">
              {DIST.map(d => (
                <div key={d.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-white/40 text-[10px]">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock property cards */}
          {MOCK_PROPS.map(p => <MockPropertyCard key={p.address} {...p} />)}

          {/* Bottom mini stats */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { value: '25', label: 'New today',       color: '#3b82f6' },
              { value: '1',  label: 'Buy It',          color: '#059669' },
              { value: '21', label: 'Worth Checking',  color: '#2563EB' },
            ].map(s => (
              <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                <p className="font-black text-xl font-mono" style={{ color: s.color }}>{s.value}</p>
                <p className="text-white/30 text-[10px] mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
