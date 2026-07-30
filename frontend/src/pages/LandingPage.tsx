import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Sparkles, Building2, Bell, Globe, ShieldCheck, LineChart,
  MapPin, Check, X, Layers, Search, Menu, X as Close, Zap, Clock, ChevronDown,
} from 'lucide-react'
import { AppIcon } from '../components/QuartisLogo'

// Deep-navy brand gradient, shared with the auth panel for a coherent identity.
const NAVY = 'radial-gradient(120% 130% at 12% -10%, #1E3A5F 0%, #131b2e 45%, #0b1120 100%)'
// Verified-reachable premium stock photo (real-estate exterior) for the hero.
const HERO_PHOTO = 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1300&q=80'

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
    <div className="min-h-screen overflow-x-hidden bg-surface text-ink antialiased" style={{ scrollBehavior: 'smooth' }}>
      <Nav scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <Hero />
      <StatsBand />
      <ProblemSolution />
      <SpotlightZoning />
      <Features />
      <ScoreExplainer />
      <HowItWorks />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  )
}

// ── Reveal on scroll (subtle, respects reduced-motion) ───────────────────────
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={className}
         style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(16px)', transition: `opacity .6s ease ${delay}ms, transform .6s cubic-bezier(.2,.7,.2,1) ${delay}ms` }}>
      {children}
    </div>
  )
}

// ── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ scrolled, menuOpen, setMenuOpen }: { scrolled: boolean; menuOpen: boolean; setMenuOpen: (v: boolean) => void }) {
  const links = [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how' },
    { label: 'FAQ', href: '#faq' },
  ]
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/85 backdrop-blur-md border-b border-surface-border shadow-sm' : 'bg-transparent'}`}>
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-md shadow-accent/30">
            <AppIcon size={19} className="text-white" />
          </span>
          <span className={`text-lg font-extrabold tracking-tight ${scrolled ? 'text-ink' : 'text-white'}`}>Plexa</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className={`text-sm font-medium transition-colors ${scrolled ? 'text-muted hover:text-ink' : 'text-slate-300 hover:text-white'}`}>{l.label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/login" className={`px-4 py-2 text-sm font-semibold transition-colors ${scrolled ? 'text-ink hover:text-accent' : 'text-white/90 hover:text-white'}`}>Sign in</Link>
          <Link to="/register" className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold shadow-sm shadow-accent/30 hover:bg-accent-hover hover:shadow-md transition-all">
            Get started <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <button className={`md:hidden p-2 -mr-2 ${scrolled ? 'text-ink' : 'text-white'}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          {menuOpen ? <Close size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {menuOpen && (
        <div className="md:hidden bg-white border-b border-surface-border px-5 py-4 space-y-3">
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
    <section className="relative overflow-hidden text-white" style={{ background: NAVY }}>
      <div aria-hidden className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(45% 45% at 82% 8%, rgba(37,99,235,0.55) 0%, transparent 70%)' }} />
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '48px 48px', maskImage: 'radial-gradient(80% 60% at 50% 20%, #000 40%, transparent 100%)' }} />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-20 lg:pt-36 lg:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-xs font-semibold text-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-score-strong animate-pulse" />
            Quebec real-estate investment intelligence
          </span>

          <h1 className="mt-5 text-[2.6rem] sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-balance">
            Spot the undervalued Quebec property <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">before anyone else.</span>
          </h1>

          <p className="mt-6 text-lg text-slate-300/90 max-w-xl leading-relaxed">
            Plexa continuously scans the Quebec market, scores every listing with AI, reveals hidden{' '}
            <span className="text-white font-semibold">development potential</span> from official records,
            and alerts you the instant an opportunity appears.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/30 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">
              Start free <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 text-white font-semibold hover:bg-white/15 transition-colors">
              See how it works
            </a>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> 2,000+ listings analyzed</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> Full analysis in seconds</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> Official-data backed</span>
          </div>
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -inset-6 rounded-[28px] bg-accent/25 blur-3xl" />
          <HeroVisual />
        </div>
      </div>
    </section>
  )
}

function HeroVisual() {
  const [failed, setFailed] = useState(false)
  if (failed) return <DashboardMock />
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 rotate-[0.6deg]">
      <img
        src={HERO_PHOTO}
        alt="Quebec investment property"
        loading="eager"
        onError={() => setFailed(true)}
        className="w-full h-[300px] sm:h-[440px] object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
        <div className="text-white">
          <p className="text-[13px] font-bold leading-tight">1195 Rue Saint-Hubert</p>
          <p className="text-[11px] text-white/80">Ville-Marie · Triplex · $1,039,000</p>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-white/95 backdrop-blur px-3 py-2 shadow-lg shrink-0">
          <span className="text-lg font-extrabold text-score-strong leading-none tabular-nums">82</span>
          <span className="text-[9px] font-bold text-score-strong uppercase tracking-wide mt-0.5">Strong buy</span>
        </div>
      </div>
    </div>
  )
}

function DashboardMock() {
  const stats = [{ label: 'Analyzed', value: '2,054' }, { label: 'Strong buys', value: '38', tone: 'text-score-strong' }, { label: 'New today', value: '12', tone: 'text-accent' }]
  const deals = [
    { addr: '1195 Rue Saint-Hubert', city: 'Ville-Marie · Triplex', price: '$1,039,000', score: 82, tone: 'strong' },
    { addr: '5343 3e Avenue', city: 'Rosemont · Duplex', price: '$729,000', score: 71, tone: 'worth' },
  ]
  return (
    <div className="relative rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden rotate-[0.6deg]">
      <div className="h-9 bg-surface border-b border-surface-border flex items-center gap-1.5 px-3.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" /><span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" /><span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[11px] text-muted font-medium">plexa.app/dashboard</span>
      </div>
      <div className="p-4 bg-surface">
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {stats.map(s => (<div key={s.label} className="rounded-xl bg-white border border-surface-border p-3"><p className={`text-xl font-extrabold tabular-nums ${s.tone ?? 'text-ink'}`}>{s.value}</p><p className="text-[10px] text-muted mt-0.5">{s.label}</p></div>))}
        </div>
        <div className="space-y-2.5">
          {deals.map(d => (
            <div key={d.addr} className="rounded-xl bg-white border border-surface-border p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg,#c7d2fe,#93c5fd)' }} />
              <div className="min-w-0 flex-1"><p className="text-[13px] font-bold text-ink truncate">{d.addr}</p><p className="text-[11px] text-muted">{d.city}</p><p className="text-[13px] font-extrabold text-ink mt-0.5 tabular-nums">{d.price}</p></div>
              <div className="text-center shrink-0"><div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-extrabold ${d.tone === 'strong' ? 'bg-score-strong' : 'bg-accent'}`}>{d.score}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Stats band (colored) ─────────────────────────────────────────────────────
function StatsBand() {
  const stats = [
    { Icon: Building2, value: '2,000+', label: 'Properties scored' },
    { Icon: Clock, value: '24/7', label: 'Market monitoring' },
    { Icon: Zap, value: '< 60s', label: 'Full analysis per deal' },
    { Icon: ShieldCheck, value: '100%', label: 'Backed by official data' },
  ]
  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(90deg,#1D4ED8,#2563EB 45%,#3b82f6)' }}>
      <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 120%, #fff 0%, transparent 40%)' }} />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8 text-white">
        {stats.map(s => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center shrink-0"><s.Icon size={20} /></span>
            <div>
              <p className="text-2xl font-extrabold tabular-nums leading-none">{s.value}</p>
              <p className="text-[13px] text-blue-100/90 mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Problem / Solution ──────────────────────────────────────────────────────
function ProblemSolution() {
  const without = ['Refresh listing sites for hours, hoping to catch a deal first', 'Guess at value with no comparable analysis', 'Never know if the lot can be developed further', 'Miss price drops until the property is already gone']
  const withPlexa = ['New deals scored and delivered to you automatically', 'AI value gap vs. comparable sales, computed instantly', 'Development potential from official zoning + lot data', 'Alerted the moment a matching property or price drop appears']
  return (
    <Section id="why" tone="surface">
      <Reveal><Heading eyebrow="Why Plexa" title="Investing on gut feel leaves money on the table" subtitle="Serious investors win on speed and information. Plexa gives you both." /></Reveal>
      <div className="grid md:grid-cols-2 gap-5 mt-12 max-w-4xl mx-auto">
        <Reveal>
          <div className="rounded-2xl bg-white border border-surface-border p-7 h-full">
            <h3 className="font-bold text-ink flex items-center gap-2 mb-5"><span className="w-8 h-8 rounded-lg bg-score-notrecommended/10 flex items-center justify-center"><X size={17} className="text-score-notrecommended" /></span> The old way</h3>
            <ul className="space-y-3.5">{without.map(t => (<li key={t} className="flex items-start gap-2.5 text-sm text-muted"><X size={16} className="text-score-notrecommended/60 mt-0.5 shrink-0" />{t}</li>))}</ul>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl border-2 border-accent/30 p-7 h-full shadow-lg shadow-accent/10" style={{ background: 'linear-gradient(180deg,#fff, #f4f8ff)' }}>
            <h3 className="font-bold text-ink flex items-center gap-2 mb-5"><span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><Check size={17} className="text-white" /></span> With Plexa</h3>
            <ul className="space-y-3.5">{withPlexa.map(t => (<li key={t} className="flex items-start gap-2.5 text-sm text-ink font-medium"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{t}</li>))}</ul>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

// ── Spotlight: development potential (the differentiator) ────────────────────
function SpotlightZoning() {
  return (
    <Section id="coverage" tone="navy">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 ring-1 ring-accent/30 text-xs font-bold text-blue-200 uppercase tracking-wide">The Plexa edge</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance">Turn a single-family lot into a development opportunity</h2>
          <p className="mt-5 text-slate-300/90 leading-relaxed">
            A property listed as a house might sit on land the city already allows you to build several units on.
            Plexa reads the official zoning code and the government lot record, then estimates what could be built —
            right on the listing, with the source document one click away.
          </p>
          <ul className="mt-6 space-y-3">
            {['Matched by GPS to the exact zoning polygon', 'Real lot size from official records — not the listing', 'Framed honestly: a guide, always “confirm with the city”'].map(t => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-slate-200"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
          <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><MapPin size={16} className="text-blue-300" /> Live for Montréal &amp; Laval — more cities on the way.</div>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-sm font-bold text-ink">7546 Rue Centrale</p><p className="text-xs text-muted">Le Plateau-Mont-Royal · Zone T4.4</p></div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-score-strong/10 text-score-strong font-bold">Verified</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-surface-border h-40 relative" style={{ background: 'linear-gradient(135deg,#eef2f7,#dbe4f0)' }}>
              <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(37,99,235,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.12) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 160" fill="none" preserveAspectRatio="none"><path d="M40 120 L60 40 L200 30 L250 60 L230 130 Z" stroke="#7c3aed" strokeWidth="2.5" fill="#7c3aed" fillOpacity="0.10" /></svg>
              <div className="absolute" style={{ left: '34%', top: '48%' }}><span className="block w-4 h-4 rounded-full bg-accent ring-4 ring-accent/25" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mt-4 items-center">
              <MockStat label="Built today" value="1" />
              <div className="flex items-center justify-center text-accent"><ArrowRight size={22} /></div>
              <MockStat label="Zoning potential" value="~4" tone="text-score-strong" />
            </div>
            <p className="mt-3 text-[11px] text-muted">Estimated from official lot area × permitted density. A guide, not a permit.</p>
          </div>
        </Reveal>
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

// ── Features ─────────────────────────────────────────────────────────────────
function Features() {
  const feats = [
    { Icon: LineChart, title: 'AI deal score, 0–100', desc: 'Every listing is graded on cap rate, cash flow, discount vs. comparable sales and risk — so you know in seconds whether it deserves a closer look, without opening a spreadsheet.' },
    { Icon: Building2, title: 'Development potential', desc: 'See what could be built on any lot from official zoning + lot data. The upside most investors never check — surfaced automatically on every property.', highlight: true },
    { Icon: Globe, title: 'One view of the whole market', desc: 'The same property, wherever it’s listed, is merged into a single card — with the lowest price surfaced so you never overpay or chase duplicates.' },
    { Icon: Bell, title: 'Instant deal alerts', desc: 'Set your criteria once. The moment a matching property — or a price drop — appears, Plexa notifies you by email or WhatsApp. Speed is the edge.' },
    { Icon: ShieldCheck, title: 'Official, verifiable data', desc: 'Lot area, dwelling counts and zoning come straight from official records — with the source document linked, so you (or your notary) can verify every number.' },
    { Icon: Sparkles, title: 'Full financial analysis', desc: 'Live Quebec taxes, welcome tax, NOI, cash flow and a 5-year projection — computed automatically for every property, not just the ones you dig into.' },
  ]
  return (
    <Section id="features" tone="white">
      <Reveal><Heading eyebrow="Features" title="Everything you need to move faster than the market" subtitle="One dashboard that replaces hours of manual research — built for investors who value their time." /></Reveal>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
        {feats.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 90}>
            <FeatureCard {...f} />
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

function FeatureCard({ Icon, title, desc, highlight }: { Icon: any; title: string; desc: string; highlight?: boolean }) {
  return (
    <div className={`group h-full rounded-2xl p-7 border transition-all hover:-translate-y-1 hover:shadow-card-hover ${highlight ? 'border-accent/30 text-white' : 'bg-white border-surface-border'}`}
         style={highlight ? { background: NAVY } : undefined}>
      <span className={`inline-flex w-12 h-12 rounded-xl items-center justify-center mb-5 transition-transform group-hover:scale-105 ${highlight ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}`}><Icon size={22} /></span>
      <h3 className={`text-lg font-bold mb-2 ${highlight ? 'text-white' : 'text-ink'}`}>{title}</h3>
      <p className={`text-sm leading-relaxed ${highlight ? 'text-slate-300' : 'text-muted'}`}>{desc}</p>
      {highlight && <span className="inline-flex items-center gap-1 mt-4 text-xs font-bold text-blue-300">Our biggest edge <ArrowRight size={13} /></span>}
    </div>
  )
}

// ── Deal-score explainer (colorful) ──────────────────────────────────────────
function ScoreExplainer() {
  const bands = [
    { label: 'Skip', range: '0–39', color: '#DC2626' },
    { label: 'Fair', range: '40–59', color: '#D97706' },
    { label: 'Worth checking', range: '60–79', color: '#2563EB' },
    { label: 'Strong buy', range: '80–100', color: '#059669' },
  ]
  return (
    <Section tone="tint">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="text-xs font-bold uppercase tracking-widest text-accent">The score</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-balance">One number tells you if it’s worth your time</h2>
          <p className="mt-5 text-muted leading-relaxed">Every property gets a 0–100 deal score that blends cash flow, cap rate, discount to market and risk. Sort your whole market by it and the best opportunities float to the top instantly.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {bands.map(b => (
              <span key={b.label} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-surface-border text-sm font-semibold text-ink">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} /> {b.label} <span className="text-muted tabular-nums">{b.range}</span>
              </span>
            ))}
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl bg-white border border-surface-border p-7 shadow-lg">
            <div className="flex items-center justify-between mb-2 text-xs font-bold text-muted"><span>0</span><span>100</span></div>
            <div className="h-4 rounded-full overflow-hidden flex">
              {bands.map(b => (<div key={b.label} className="flex-1" style={{ background: b.color }} />))}
            </div>
            <div className="relative mt-3 h-8">
              <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: '82%' }}>
                <span className="w-9 h-9 rounded-full bg-score-strong text-white text-sm font-extrabold flex items-center justify-center shadow-lg ring-4 ring-score-strong/20">82</span>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <MockStat label="Cap rate" value="4.8%" />
              <MockStat label="Cash flow" value="+$310" tone="text-score-strong" />
              <MockStat label="vs. market" value="-11%" tone="text-score-strong" />
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

// ── How it works ────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { Icon: Search, title: 'We scan, around the clock', desc: 'Plexa continuously monitors the Quebec market and merges duplicate listings into one clean record.' },
    { Icon: Layers, title: 'AI scores & checks zoning', desc: 'Each property gets a deal score, full financials, comparable analysis, and its development potential.' },
    { Icon: Bell, title: 'You get the edge', desc: 'Browse the ranked dashboard, or let alerts bring the best matching deals straight to your inbox.' },
  ]
  return (
    <Section id="how" tone="white">
      <Reveal><Heading eyebrow="How it works" title="From the whole market to a verdict — in seconds" /></Reveal>
      <div className="grid md:grid-cols-3 gap-6 mt-16">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 110}>
            <div className="relative h-full rounded-2xl border border-surface-border p-7" style={{ background: 'linear-gradient(180deg,#fff,#f6f9ff)' }}>
              <span className="absolute -top-4 -left-3 w-10 h-10 rounded-xl bg-accent text-white text-sm font-extrabold flex items-center justify-center shadow-md shadow-accent/30">{i + 1}</span>
              <s.Icon size={26} className="text-accent mb-4 mt-1" />
              <h3 className="text-lg font-bold text-ink mb-2">{s.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    { q: 'I found a triplex 12% under market the morning it was listed. Plexa flagged the development upside I would have completely missed.', n: 'Marc-André L.', r: 'Plex investor · Montréal' },
    { q: 'The zoning read alone is worth it. Knowing a lot can take four units before I even call the broker changes how I bid.', n: 'Sophie T.', r: 'Real-estate investor · Laval' },
    { q: 'I used to spend my evenings refreshing listings. Now the good deals just land in my inbox, already analyzed.', n: 'David R.', r: 'Buy-and-hold investor' },
  ]
  return (
    <Section tone="surface">
      <Reveal><Heading eyebrow="Investors" title="Built for people who move first" /></Reveal>
      <div className="grid md:grid-cols-3 gap-5 mt-12">
        {quotes.map((t, i) => (
          <Reveal key={t.n} delay={i * 90}>
            <figure className="h-full rounded-2xl bg-white border border-surface-border p-7 flex flex-col">
              <div className="flex gap-0.5 mb-4 text-score-market">{Array.from({ length: 5 }).map((_, k) => (<span key={k}>★</span>))}</div>
              <blockquote className="text-sm text-ink leading-relaxed flex-1">“{t.q}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-accent/15 text-accent font-bold flex items-center justify-center text-sm">{t.n[0]}</span>
                <span><span className="block text-sm font-bold text-ink">{t.n}</span><span className="block text-xs text-muted">{t.r}</span></span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ() {
  const faqs = [
    { q: 'How accurate is the data?', a: 'Lot size, dwelling counts and zoning come from official government records, with the source document linked on each property so you can verify it yourself. Financials use live Quebec tax rates. The development estimate is always framed as a guide — confirm with the city before acting.' },
    { q: 'Which cities are covered?', a: 'Development potential is live for Montréal and Laval today, with more Quebec cities being added. Deal scoring and financial analysis work across the wider Quebec market.' },
    { q: 'How do alerts work?', a: 'Set your criteria once — location, budget, property type and minimum deal quality. When a new matching property or a price drop appears, Plexa notifies you by email or WhatsApp within the hour.' },
    { q: 'Do I need a credit card to start?', a: 'No. You can create an account and start exploring the dashboard for free. No card required, cancel anytime.' },
  ]
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Section id="faq" tone="white">
      <Reveal><Heading eyebrow="FAQ" title="Questions, answered" /></Reveal>
      <div className="max-w-3xl mx-auto mt-12 space-y-3">
        {faqs.map((f, i) => (
          <div key={f.q} className="rounded-2xl border border-surface-border bg-white overflow-hidden">
            <button className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left" onClick={() => setOpen(open === i ? null : i)}>
              <span className="font-bold text-ink">{f.q}</span>
              <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-6 pb-6 -mt-1 text-sm text-muted leading-relaxed">{f.a}</p>}
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
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(70% 80% at 50% 40%, #000 40%, transparent 100%)' }} />
        <div className="relative">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance max-w-3xl mx-auto">Stop guessing. Start investing with an edge.</h2>
          <p className="mt-5 text-lg text-slate-300/90 max-w-xl mx-auto">Join Quebec investors who find better deals in less time with Plexa.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/30 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">Get started free <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></Link>
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
  const columns: { title: string; items: { label: string; to?: string; href?: string }[] }[] = [
    { title: 'Product', items: [{ label: 'Features', href: '#features' }, { label: 'How it works', href: '#how' }, { label: 'FAQ', href: '#faq' }] },
    { title: 'Account', items: [{ label: 'Sign in', to: '/login' }, { label: 'Create account', to: '/register' }] },
    { title: 'Company', items: [{ label: 'About' }, { label: 'Contact' }, { label: 'Privacy' }, { label: 'Terms' }] },
  ]
  return (
    <footer className="bg-ink text-slate-300">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-14 pb-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center"><AppIcon size={19} className="text-white" /></span>
              <span className="text-lg font-extrabold tracking-tight text-white">Plexa</span>
            </div>
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">Quebec real-estate investment intelligence — AI-scored deals, development potential from official data, and instant alerts.</p>
            <Link to="/register" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors">Get started free <ArrowRight size={15} /></Link>
          </div>
          {columns.map(col => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">{col.title}</p>
              <ul className="space-y-2.5">
                {col.items.map(item => (
                  <li key={item.label}>
                    {item.to ? <Link to={item.to} className="text-sm text-slate-300 hover:text-white transition-colors">{item.label}</Link>
                      : item.href ? <a href={item.href} className="text-sm text-slate-300 hover:text-white transition-colors">{item.label}</a>
                      : <span className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer">{item.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Plexa. All rights reserved.</p>
          <p className="text-xs text-slate-500 text-center sm:text-right">Indicative analysis only — confirm with a licensed professional before investing.</p>
        </div>
      </div>
    </footer>
  )
}

// ── Shared building blocks ──────────────────────────────────────────────────
function Section({ id, tone = 'white', children }: { id?: string; tone?: 'white' | 'surface' | 'tint' | 'navy'; children: React.ReactNode }) {
  const toneClass =
    tone === 'navy' ? 'text-white' :
    tone === 'tint' ? 'bg-accent/[0.04]' :
    tone === 'surface' ? 'bg-surface' : 'bg-white'
  const style = tone === 'navy' ? { background: NAVY } : undefined
  return (
    <section id={id} className={`px-5 sm:px-8 py-20 sm:py-24 ${toneClass}`} style={style}>
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
