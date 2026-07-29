import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Sparkles, Building2, Bell, Globe, ShieldCheck, LineChart,
  MapPin, Check, X, Layers, Search, Menu, X as Close,
} from 'lucide-react'
import { AppIcon } from '../components/QuartisLogo'

// Deep-navy brand gradient shared with the auth panel for a coherent identity.
const NAVY = 'radial-gradient(120% 130% at 12% -10%, #1E3A5F 0%, #131b2e 45%, #0b1120 100%)'

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-surface text-ink antialiased" style={{ scrollBehavior: 'smooth' }}>
      <Nav scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <Hero />
      <SourceBar />
      <ProblemSolution />
      <Features />
      <ZoningSpotlight />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </div>
  )
}

// ── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ scrolled, menuOpen, setMenuOpen }: { scrolled: boolean; menuOpen: boolean; setMenuOpen: (v: boolean) => void }) {
  const links = [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how' },
    { label: 'Coverage', href: '#coverage' },
  ]
  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/85 backdrop-blur-md border-b border-surface-border shadow-sm' : 'bg-transparent'}`}>
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-md">
            <AppIcon size={19} className="text-white" />
          </span>
          <span className={`text-lg font-extrabold tracking-tight ${scrolled ? 'text-ink' : 'text-ink'}`}>Arpent</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-muted hover:text-ink transition-colors">{l.label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/login" className="px-4 py-2 text-sm font-semibold text-ink hover:text-accent transition-colors">Sign in</Link>
          <Link to="/register" className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold shadow-sm hover:bg-accent-hover hover:shadow-md transition-all">
            Get started <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <button className="md:hidden p-2 -mr-2 text-ink" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          {menuOpen ? <Close size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {menuOpen && (
        <div className="md:hidden bg-white border-b border-surface-border px-5 py-4 space-y-3 animate-slide-up">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-muted">{l.label}</a>
          ))}
          <div className="flex gap-2 pt-2">
            <Link to="/login" className="flex-1 text-center px-4 py-2 rounded-xl border border-surface-border text-sm font-semibold">Sign in</Link>
            <Link to="/register" className="flex-1 text-center px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">Get started</Link>
          </div>
        </div>
      )}
    </header>
  )
}

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden -mt-16 pt-16 text-white" style={{ background: NAVY }}>
      <div aria-hidden className="absolute inset-0 opacity-40"
           style={{ background: 'radial-gradient(45% 45% at 82% 8%, rgba(37,99,235,0.55) 0%, transparent 70%)' }} />
      <div aria-hidden className="absolute inset-0"
           style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '48px 48px', maskImage: 'radial-gradient(80% 60% at 50% 20%, #000 40%, transparent 100%)' }} />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-xs font-semibold text-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-score-strong animate-pulse" />
            Quebec real-estate investment intelligence
          </span>

          <h1 className="mt-5 text-[2.6rem] sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-balance">
            Spot the undervalued Quebec property <span className="text-blue-300">before anyone else.</span>
          </h1>

          <p className="mt-6 text-lg text-slate-300/90 max-w-xl leading-relaxed">
            Arpent scans Centris, Realtor.ca and Remax every few hours, scores every deal with AI,
            reveals hidden <span className="text-white font-semibold">development potential</span> from official
            zoning data, and alerts you the moment an opportunity appears.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/25 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">
              Start free <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 text-white font-semibold hover:bg-white/15 transition-colors">
              See how it works
            </a>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> 2,000+ listings analyzed</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> 3 sources, one view</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> Official government data</span>
          </div>
        </div>

        {/* Product mockup */}
        <div className="relative">
          <div aria-hidden className="absolute -inset-6 rounded-[28px] bg-accent/20 blur-3xl" />
          <DashboardMock />
        </div>
      </div>
    </section>
  )
}

// A self-contained preview of the actual product — reliable and on-brand.
function DashboardMock() {
  const stats = [
    { label: 'Analyzed', value: '2,054' },
    { label: 'Strong buys', value: '38', tone: 'text-score-strong' },
    { label: 'New today', value: '12', tone: 'text-accent' },
  ]
  const deals = [
    { addr: '1195 Rue Saint-Hubert', city: 'Ville-Marie · Triplex', price: '$1,039,000', score: 82, cat: 'Strong buy', tone: 'strong' },
    { addr: '5343 3e Avenue', city: 'Rosemont · Duplex', price: '$729,000', score: 71, cat: 'Worth checking', tone: 'worth' },
  ]
  return (
    <div className="relative rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden rotate-[0.6deg]">
      {/* window chrome */}
      <div className="h-9 bg-surface border-b border-surface-border flex items-center gap-1.5 px-3.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[11px] text-muted font-medium">arpent.app/dashboard</span>
      </div>
      <div className="p-4 bg-surface">
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl bg-white border border-surface-border p-3">
              <p className={`text-xl font-extrabold tabular-nums ${s.tone ?? 'text-ink'}`}>{s.value}</p>
              <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2.5">
          {deals.map(d => (
            <div key={d.addr} className="rounded-xl bg-white border border-surface-border p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg,#c7d2fe,#93c5fd)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink truncate">{d.addr}</p>
                <p className="text-[11px] text-muted">{d.city}</p>
                <p className="text-[13px] font-extrabold text-ink mt-0.5 tabular-nums">{d.price}</p>
              </div>
              <div className="text-center shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-extrabold ${d.tone === 'strong' ? 'bg-score-strong' : 'bg-accent'}`}>{d.score}</div>
                <p className={`text-[9px] font-bold mt-1 ${d.tone === 'strong' ? 'text-score-strong' : 'text-accent'}`}>{d.cat}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Source / trust bar ──────────────────────────────────────────────────────
function SourceBar() {
  const sources = ['Centris', 'Realtor.ca', 'Remax Québec', 'Rôle d’évaluation foncière', 'Plan d’urbanisme']
  return (
    <section className="border-b border-surface-border bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted/70 mb-4">
          Powered by multi-source &amp; official government data
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {sources.map(s => (
            <span key={s} className="text-sm font-semibold text-muted/80">{s}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Problem / Solution ──────────────────────────────────────────────────────
function ProblemSolution() {
  const without = ['Refresh Centris for hours, hoping to catch a deal first', 'Guess at value with no comparable analysis', 'Never know if the lot can be developed further', 'Miss price drops until the property is gone']
  const withArpent = ['New deals scored and delivered to you automatically', 'AI value gap vs. comparable sales, instantly', 'Development potential from official zoning + lot data', 'Alerted the moment a matching property or price drop appears']
  return (
    <Section className="bg-surface">
      <Heading eyebrow="The problem" title="Investing on gut feel leaves money on the table" />
      <div className="grid md:grid-cols-2 gap-5 mt-12 max-w-4xl mx-auto">
        <div className="rounded-2xl bg-white border border-surface-border p-7">
          <h3 className="font-bold text-ink flex items-center gap-2 mb-4"><span className="w-7 h-7 rounded-lg bg-score-notrecommended/10 flex items-center justify-center"><X size={16} className="text-score-notrecommended" /></span> Without Arpent</h3>
          <ul className="space-y-3">
            {without.map(t => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-muted"><X size={16} className="text-score-notrecommended/70 mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-white border-2 border-accent/25 p-7 shadow-lg shadow-accent/5">
          <h3 className="font-bold text-ink flex items-center gap-2 mb-4"><span className="w-7 h-7 rounded-lg bg-score-strong/10 flex items-center justify-center"><Check size={16} className="text-score-strong" /></span> With Arpent</h3>
          <ul className="space-y-3">
            {withArpent.map(t => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-ink"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

// ── Features (bento) ────────────────────────────────────────────────────────
function Features() {
  return (
    <Section id="features" className="bg-white">
      <Heading eyebrow="Features" title="Everything you need to move faster than the market" subtitle="One dashboard that replaces hours of manual research across every Quebec listing site." />
      <div className="grid md:grid-cols-3 gap-5 mt-12">
        <FeatureCard Icon={LineChart} title="AI deal score, 0–100" desc="Every listing scored on cap rate, cash flow, discount vs. comparable sales, and risk — so you know in seconds if it's worth your time." />
        <FeatureCard Icon={Building2} title="Development potential" desc="See what could be built on any lot using official zoning + assessment-roll data. The upside most investors never check." highlight />
        <FeatureCard Icon={Globe} title="Cross-site price check" desc="The same property on Centris, Realtor.ca and Remax — merged into one card, with the lowest price surfaced." />
        <FeatureCard Icon={Bell} title="Instant deal alerts" desc="Set your criteria once. Get an email or WhatsApp the moment a matching property — or a price drop — appears." />
        <FeatureCard Icon={ShieldCheck} title="Official, verifiable data" desc="Lot area, dwellings and zoning come straight from the rôle d'évaluation foncière and city plans — with the source linked." />
        <FeatureCard Icon={Sparkles} title="Full financial analysis" desc="Live Quebec taxes, welcome tax, NOI, cash flow and a 5-year projection — computed for every property automatically." />
      </div>
    </Section>
  )
}

function FeatureCard({ Icon, title, desc, highlight }: { Icon: any; title: string; desc: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-7 border transition-all hover:-translate-y-1 hover:shadow-card-hover ${highlight ? 'bg-accent/[0.04] border-accent/25' : 'bg-white border-surface-border'}`}>
      <span className={`inline-flex w-11 h-11 rounded-xl items-center justify-center mb-4 ${highlight ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}`}>
        <Icon size={20} />
      </span>
      <h3 className="text-lg font-bold text-ink mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{desc}</p>
      {highlight && <span className="inline-block mt-4 text-xs font-bold text-accent">Our edge →</span>}
    </div>
  )
}

// ── Zoning spotlight ────────────────────────────────────────────────────────
function ZoningSpotlight() {
  return (
    <Section id="coverage" className="bg-surface">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-accent">The Arpent edge</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-balance">Turn a single-family lot into a development opportunity</h2>
          <p className="mt-5 text-muted leading-relaxed">
            A property listed as a house might sit on land the city already allows you to build several units on.
            Arpent reads the official zoning code and the government lot record, then estimates what could be built —
            right on the listing, with the source document one click away.
          </p>
          <ul className="mt-6 space-y-3">
            {['Matched by GPS to the exact zoning polygon', 'Real lot size from the assessment roll — not the listing', 'Framed honestly: a guide, always “confirm with the city”'].map(t => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-ink"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
          <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-muted">
            <MapPin size={16} className="text-accent" /> Live for Montréal &amp; Laval — more cities on the way.
          </div>
        </div>

        {/* zoning mini-visual */}
        <div className="rounded-2xl bg-white border border-surface-border p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-ink">7546 Rue Centrale</p>
              <p className="text-xs text-muted">Le Plateau-Mont-Royal · Zone T4.4</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-score-strong/10 text-score-strong font-bold">Verified</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-surface-border h-40 relative"
               style={{ background: 'linear-gradient(135deg,#eef2f7,#dbe4f0)' }}>
            <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(37,99,235,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.12) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 160" fill="none" preserveAspectRatio="none">
              <path d="M40 120 L60 40 L200 30 L250 60 L230 130 Z" stroke="#7c3aed" strokeWidth="2.5" fill="#7c3aed" fillOpacity="0.10" />
            </svg>
            <div className="absolute" style={{ left: '34%', top: '48%' }}>
              <span className="block w-4 h-4 rounded-full bg-accent ring-4 ring-accent/25" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-4 items-center">
            <MockStat label="Built today" value="1" />
            <div className="flex items-center justify-center text-muted/50 text-lg">→</div>
            <MockStat label="Zoning potential" value="~4" tone="text-score-strong" />
          </div>
          <p className="mt-3 text-[11px] text-muted">Estimated from official lot area × permitted density. A guide, not a permit.</p>
        </div>
      </div>
    </Section>
  )
}

function MockStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-surface-border p-3 text-center">
      <p className={`text-2xl font-extrabold tabular-nums ${tone ?? 'text-ink'}`}>{value}</p>
      <p className="text-[10px] text-muted mt-0.5">{label}</p>
    </div>
  )
}

// ── How it works ────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { Icon: Search, title: 'We scan, around the clock', desc: 'Arpent scrapes Centris, Realtor.ca and Remax every few hours and merges duplicate listings into one.' },
    { Icon: Layers, title: 'AI scores & checks zoning', desc: 'Each property gets a deal score, full financials, comparable analysis, and its development potential.' },
    { Icon: Bell, title: 'You get the edge', desc: 'Browse the ranked dashboard, or let alerts bring the best matching deals straight to your inbox.' },
  ]
  return (
    <Section id="how" className="bg-white">
      <Heading eyebrow="How it works" title="From listing to verdict in under a minute" />
      <div className="grid md:grid-cols-3 gap-6 mt-14">
        {steps.map((s, i) => (
          <div key={s.title} className="relative rounded-2xl bg-surface border border-surface-border p-7">
            <span className="absolute -top-3 -left-3 w-9 h-9 rounded-xl bg-accent text-white text-sm font-extrabold flex items-center justify-center shadow-md">{i + 1}</span>
            <s.Icon size={24} className="text-accent mb-4" />
            <h3 className="text-lg font-bold text-ink mb-2">{s.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="px-5 sm:px-8 py-16">
      <div className="relative max-w-6xl mx-auto rounded-3xl overflow-hidden text-white text-center px-6 py-16 sm:py-20" style={{ background: NAVY }}>
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgba(37,99,235,0.5) 0%, transparent 70%)' }} />
        <div className="relative">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance max-w-3xl mx-auto">Stop guessing. Start investing with an edge.</h2>
          <p className="mt-5 text-lg text-slate-300/90 max-w-xl mx-auto">Join Quebec investors who find better deals in less time with Arpent.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/25 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">
              Get started free <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link to="/login" className="px-7 py-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 font-semibold hover:bg-white/15 transition-colors">Sign in</Link>
          </div>
          <p className="mt-5 text-xs text-slate-400">No credit card required · Cancel anytime</p>
        </div>
      </div>
    </section>
  )
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-surface-border bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><AppIcon size={17} className="text-white" /></span>
          <span className="font-extrabold tracking-tight">Arpent</span>
          <span className="text-sm text-muted ml-2 hidden sm:inline">Quebec real-estate intelligence</span>
        </div>
        <p className="text-xs text-muted/70 text-center">© {new Date().getFullYear()} Arpent · Indicative analysis only — confirm with a professional before investing.</p>
      </div>
    </footer>
  )
}

// ── Shared building blocks ──────────────────────────────────────────────────
function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`px-5 sm:px-8 py-20 sm:py-24 ${className}`}>
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  )
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <span className="text-xs font-bold uppercase tracking-widest text-accent">{eyebrow}</span>
      <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-balance">{title}</h2>
      {subtitle && <p className="mt-4 text-muted leading-relaxed">{subtitle}</p>}
    </div>
  )
}
