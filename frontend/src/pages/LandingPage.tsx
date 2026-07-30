import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Building2, Bell, ShieldCheck, LineChart, Map, Calculator,
  BarChart3, MapPin, Check, X, Layers, Search, Menu, X as Close, Zap, Clock,
  ChevronDown, TrendingUp, AlertTriangle, History, Landmark, Star,
} from 'lucide-react'
import { AppIcon } from '../components/QuartisLogo'
import { useLang } from '../context/LanguageContext'
import { LANDING_COPY } from './landingCopy'

const NAVY = 'radial-gradient(120% 130% at 12% -10%, #1E3A5F 0%, #131b2e 45%, #0b1120 100%)'
const CARD_NAVY = 'linear-gradient(160deg, #16233c 0%, #101a2e 100%)'
const HERO_PHOTO = 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1300&q=80'

const FEATURE_ICONS = [LineChart, Building2, Map, Calculator, BarChart3, Bell]
const ALSO_ICONS = [TrendingUp, AlertTriangle, History, Landmark, ShieldCheck, MapPin]
const STAT_ICONS = [Building2, Clock, Zap, ShieldCheck]
const STEP_ICONS = [Search, Layers, Bell]

export default function LandingPage() {
  const { lang } = useLang()
  const t = LANDING_COPY[lang] ?? LANDING_COPY.en
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
      <Nav t={t} scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <Hero t={t} />
      <StatsBand t={t} />
      <ProblemSolution t={t} />
      <SpotlightZoning t={t} />
      <Features t={t} />
      <ScoreExplainer t={t} />
      <HowItWorks t={t} />
      <Testimonials t={t} />
      <FAQ t={t} />
      <FinalCTA t={t} />
      <Footer t={t} />
    </div>
  )
}

type Copy = typeof LANDING_COPY.en

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(16px)', transition: `opacity .6s ease ${delay}ms, transform .6s cubic-bezier(.2,.7,.2,1) ${delay}ms` }}>
      {children}
    </div>
  )
}

// ── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ t, scrolled, menuOpen, setMenuOpen }: { t: Copy; scrolled: boolean; menuOpen: boolean; setMenuOpen: (v: boolean) => void }) {
  const { lang, setLang } = useLang()
  const links = [{ label: t.nav.features, href: '#features' }, { label: t.nav.how, href: '#how' }, { label: t.nav.faq, href: '#faq' }]
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md border-b border-surface-border shadow-sm' : 'bg-transparent'}`}>
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-md shadow-accent/30"><AppIcon size={19} className="text-white" /></span>
          <span className={`text-lg font-extrabold tracking-tight ${scrolled ? 'text-ink' : 'text-white'}`}>Plexa</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (<a key={l.href} href={l.href} className={`text-sm font-semibold transition-colors ${scrolled ? 'text-muted hover:text-ink' : 'text-slate-300 hover:text-white'}`}>{l.label}</a>))}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <LangToggle lang={lang} setLang={setLang} scrolled={scrolled} />
          <Link to="/login" className={`px-4 py-2 text-sm font-semibold transition-colors ${scrolled ? 'text-ink hover:text-accent' : 'text-white/90 hover:text-white'}`}>{t.nav.signin}</Link>
          <Link to="/register" className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold shadow-sm shadow-accent/30 hover:bg-accent-hover hover:shadow-md transition-all">{t.nav.getStarted} <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></Link>
        </div>
        <button className={`md:hidden p-2 -mr-2 ${scrolled ? 'text-ink' : 'text-white'}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? <Close size={22} /> : <Menu size={22} />}</button>
      </nav>
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-surface-border px-5 py-4 space-y-3">
          {links.map(l => (<a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm font-semibold text-muted">{l.label}</a>))}
          <div className="flex items-center gap-2 pt-1"><LangToggle lang={lang} setLang={setLang} scrolled /></div>
          <div className="flex gap-2 pt-1">
            <Link to="/login" className="flex-1 text-center px-4 py-2 rounded-xl border border-surface-border text-sm font-semibold">{t.nav.signin}</Link>
            <Link to="/register" className="flex-1 text-center px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">{t.nav.getStarted}</Link>
          </div>
        </div>
      )}
    </header>
  )
}

function LangToggle({ lang, setLang, scrolled }: { lang: 'en' | 'fr'; setLang: (l: 'en' | 'fr') => void; scrolled: boolean }) {
  return (
    <div className={`flex items-center rounded-lg p-0.5 text-xs font-bold ${scrolled ? 'bg-surface' : 'bg-white/10 ring-1 ring-white/15'}`}>
      {(['en', 'fr'] as const).map(l => (
        <button key={l} onClick={() => setLang(l)}
          className={`px-2.5 py-1 rounded-md transition-colors ${lang === l ? 'bg-accent text-white' : scrolled ? 'text-muted' : 'text-slate-300'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero({ t }: { t: Copy }) {
  return (
    <section className="relative overflow-hidden text-white" style={{ background: NAVY }}>
      <div aria-hidden className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(45% 45% at 82% 8%, rgba(37,99,235,0.55) 0%, transparent 70%)' }} />
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '48px 48px', maskImage: 'radial-gradient(80% 60% at 50% 20%, #000 40%, transparent 100%)' }} />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-20 lg:pt-36 lg:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-xs font-semibold text-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-score-strong animate-pulse" /> {t.hero.badge}
          </span>
          <h1 className="mt-5 text-[2.6rem] sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-balance">
            {t.hero.h1a} <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">{t.hero.h1b}</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-xl leading-relaxed">{t.hero.sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/30 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">{t.hero.cta1} <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></Link>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 text-white font-semibold hover:bg-white/15 transition-colors">{t.hero.cta2}</a>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            {t.hero.trust.map(s => (<span key={s} className="inline-flex items-center gap-1.5"><Check size={15} className="text-score-strong" /> {s}</span>))}
          </div>
        </div>
        <div className="relative">
          <div aria-hidden className="absolute -inset-6 rounded-[28px] bg-accent/25 blur-3xl" />
          <HeroVisual t={t} />
        </div>
      </div>
    </section>
  )
}

function HeroVisual({ t }: { t: Copy }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 h-[440px]" />
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 rotate-[0.6deg]">
      <img src={HERO_PHOTO} alt="Quebec investment property" loading="eager" onError={() => setFailed(true)} className="w-full h-[300px] sm:h-[440px] object-cover" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
        <div className="text-white"><p className="text-[13px] font-bold leading-tight">1195 Rue Saint-Hubert</p><p className="text-[11px] text-white/80">Ville-Marie · Triplex · $1,039,000</p></div>
        <div className="flex flex-col items-center rounded-xl bg-white/95 backdrop-blur px-3 py-2 shadow-lg shrink-0"><span className="text-lg font-extrabold text-score-strong leading-none tabular-nums">82</span><span className="text-[9px] font-bold text-score-strong uppercase tracking-wide mt-0.5">{t.hero.chip}</span></div>
      </div>
    </div>
  )
}

// ── Stats band ────────────────────────────────────────────────────────────────
function StatsBand({ t }: { t: Copy }) {
  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(90deg,#1D4ED8,#2563EB 50%,#1D4ED8)' }}>
      <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 15% 130%, #fff 0%, transparent 45%)' }} />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8 text-white">
        {t.stats.map((s, i) => {
          const Icon = STAT_ICONS[i]
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center shrink-0"><Icon size={20} /></span>
              <div><p className="text-2xl font-extrabold tabular-nums leading-none">{s.value}</p><p className="text-[13px] text-blue-100 mt-1">{s.label}</p></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Problem / Solution ──────────────────────────────────────────────────────
function ProblemSolution({ t }: { t: Copy }) {
  return (
    <Section id="why">
      <Reveal><Heading eyebrow={t.why.eyebrow} title={t.why.title} subtitle={t.why.subtitle} /></Reveal>
      <div className="grid md:grid-cols-2 gap-5 mt-12 max-w-4xl mx-auto">
        <Reveal>
          <div className="rounded-2xl bg-white border border-surface-border p-7 h-full shadow-card">
            <h3 className="font-bold text-ink flex items-center gap-2 mb-5"><span className="w-8 h-8 rounded-lg bg-score-notrecommended/10 flex items-center justify-center"><X size={17} className="text-score-notrecommended" /></span> {t.why.oldTitle}</h3>
            <ul className="space-y-3.5">{t.why.old.map(x => (<li key={x} className="flex items-start gap-2.5 text-sm text-muted"><X size={16} className="text-score-notrecommended/60 mt-0.5 shrink-0" />{x}</li>))}</ul>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl border-2 border-accent/40 p-7 h-full shadow-lg shadow-accent/10 bg-white">
            <h3 className="font-bold text-ink flex items-center gap-2 mb-5"><span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><Check size={17} className="text-white" /></span> {t.why.newTitle}</h3>
            <ul className="space-y-3.5">{t.why.neu.map(x => (<li key={x} className="flex items-start gap-2.5 text-sm text-ink font-medium"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{x}</li>))}</ul>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

// ── Spotlight ─────────────────────────────────────────────────────────────────
function SpotlightZoning({ t }: { t: Copy }) {
  return (
    <Section id="coverage" tone="navy">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/25 ring-1 ring-accent/40 text-xs font-bold text-blue-100 uppercase tracking-wide">{t.spot.edge}</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance">{t.spot.title}</h2>
          <p className="mt-5 text-slate-300 leading-relaxed">{t.spot.body}</p>
          <ul className="mt-6 space-y-3">{t.spot.bullets.map(x => (<li key={x} className="flex items-start gap-2.5 text-sm text-slate-200"><Check size={16} className="text-score-strong mt-0.5 shrink-0" />{x}</li>))}</ul>
          <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><MapPin size={16} className="text-blue-300" /> {t.spot.coverage}</div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-sm font-bold text-ink">7546 Rue Centrale</p><p className="text-xs text-muted">Le Plateau-Mont-Royal · Zone T4.4</p></div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-score-strong/10 text-score-strong font-bold">{t.spot.verified}</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-surface-border h-40 relative" style={{ background: 'linear-gradient(135deg,#eef2f7,#dbe4f0)' }}>
              <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(37,99,235,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.12) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 160" fill="none" preserveAspectRatio="none"><path d="M40 120 L60 40 L200 30 L250 60 L230 130 Z" stroke="#7c3aed" strokeWidth="2.5" fill="#7c3aed" fillOpacity="0.10" /></svg>
              <div className="absolute" style={{ left: '34%', top: '48%' }}><span className="block w-4 h-4 rounded-full bg-accent ring-4 ring-accent/25" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mt-4 items-center">
              <MockStat label={t.spot.builtToday} value="1" />
              <div className="flex items-center justify-center text-accent"><ArrowRight size={22} /></div>
              <MockStat label={t.spot.potential} value="~4" tone="text-score-strong" />
            </div>
            <p className="mt-3 text-[11px] text-muted">{t.spot.note}</p>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

function MockStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (<div className="rounded-xl border border-surface-border p-3 text-center bg-surface"><p className={`text-2xl font-extrabold tabular-nums ${tone ?? 'text-ink'}`}>{value}</p><p className="text-[10px] text-muted mt-0.5">{label}</p></div>)
}

// ── Features (dark-blue blocks) ──────────────────────────────────────────────
function Features({ t }: { t: Copy }) {
  return (
    <Section id="features">
      <Reveal><Heading eyebrow={t.features.eyebrow} title={t.features.title} subtitle={t.features.subtitle} /></Reveal>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
        {t.features.cards.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 90}>
            <FeatureCard Icon={FEATURE_ICONS[i]} title={f.title} desc={f.desc} highlight={i === 1} edgeLabel={t.features.edge} />
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <div className="mt-6 rounded-2xl p-6 sm:p-7 text-white shadow-xl" style={{ background: CARD_NAVY }}>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-5">{t.features.alsoTitle}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {t.features.also.map((label, i) => {
              const Icon = ALSO_ICONS[i]
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-accent/20 text-blue-200 flex items-center justify-center shrink-0"><Icon size={17} /></span>
                  <span className="text-sm font-semibold text-slate-100">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

function FeatureCard({ Icon, title, desc, highlight, edgeLabel }: { Icon: any; title: string; desc: string; highlight?: boolean; edgeLabel: string }) {
  return (
    <div className="group relative h-full rounded-2xl p-7 text-white shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
         style={{ background: CARD_NAVY, boxShadow: highlight ? '0 0 0 1.5px rgba(37,99,235,.6), 0 20px 40px -20px rgba(37,99,235,.5)' : undefined }}>
      {highlight && <span className="absolute top-5 right-5 text-[10px] font-extrabold uppercase tracking-wide text-white bg-accent px-2 py-1 rounded-full">{edgeLabel}</span>}
      <span className="inline-flex w-12 h-12 rounded-xl items-center justify-center mb-5 bg-accent text-white shadow-lg shadow-accent/30 transition-transform group-hover:scale-105"><Icon size={22} /></span>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{desc}</p>
    </div>
  )
}

// ── Score explainer ────────────────────────────────────────────────────────
function ScoreExplainer({ t }: { t: Copy }) {
  const colors = ['#DC2626', '#D97706', '#2563EB', '#059669']
  return (
    <Section tone="navy">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="text-xs font-bold uppercase tracking-widest text-blue-300">{t.score.eyebrow}</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance">{t.score.title}</h2>
          <p className="mt-5 text-slate-300 leading-relaxed">{t.score.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {t.score.bands.map((b, i) => (<span key={b.label} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-sm font-semibold text-white"><span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[i] }} /> {b.label} <span className="text-slate-400 tabular-nums">{b.range}</span></span>))}
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between mb-2 text-xs font-bold text-muted"><span>0</span><span>100</span></div>
            <div className="h-4 rounded-full overflow-hidden flex">{colors.map(c => (<div key={c} className="flex-1" style={{ background: c }} />))}</div>
            <div className="relative mt-3 h-9"><div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: '82%' }}><span className="w-9 h-9 rounded-full bg-score-strong text-white text-sm font-extrabold flex items-center justify-center shadow-lg ring-4 ring-score-strong/20">82</span></div></div>
            <div className="mt-6 grid grid-cols-3 gap-2.5"><MockStat label={t.score.capRate} value="4.8%" /><MockStat label={t.score.cashFlow} value="+$310" tone="text-score-strong" /><MockStat label={t.score.vsMarket} value="-11%" tone="text-score-strong" /></div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

// ── How it works ────────────────────────────────────────────────────────────
function HowItWorks({ t }: { t: Copy }) {
  return (
    <Section id="how">
      <Reveal><Heading eyebrow={t.how.eyebrow} title={t.how.title} /></Reveal>
      <div className="grid md:grid-cols-3 gap-6 mt-16">
        {t.how.steps.map((s, i) => {
          const Icon = STEP_ICONS[i]
          return (
            <Reveal key={s.title} delay={i * 110}>
              <div className="relative h-full rounded-2xl bg-white border border-surface-border p-7 shadow-card">
                <span className="absolute -top-4 -left-3 w-10 h-10 rounded-xl bg-accent text-white text-sm font-extrabold flex items-center justify-center shadow-md shadow-accent/30">{i + 1}</span>
                <Icon size={26} className="text-accent mb-4 mt-1" />
                <h3 className="text-lg font-bold text-ink mb-2">{s.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────────
function Testimonials({ t }: { t: Copy }) {
  const imgs = ['https://randomuser.me/api/portraits/men/32.jpg', 'https://randomuser.me/api/portraits/women/44.jpg', 'https://randomuser.me/api/portraits/men/75.jpg']
  return (
    <Section>
      <Reveal><Heading eyebrow={t.tst.eyebrow} title={t.tst.title} /></Reveal>
      <div className="grid md:grid-cols-3 gap-5 mt-12">
        {t.tst.quotes.map((q, i) => (
          <Reveal key={q.n} delay={i * 90}>
            <figure className="h-full rounded-2xl bg-white border border-surface-border shadow-card p-7 flex flex-col">
              <div className="flex gap-0.5 mb-4 text-score-market">{Array.from({ length: 5 }).map((_, k) => (<Star key={k} size={16} className="fill-current" />))}</div>
              <blockquote className="text-sm text-ink leading-relaxed flex-1">“{q.q}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <img src={imgs[i]} alt={q.n} loading="lazy" className="w-11 h-11 rounded-full object-cover ring-2 ring-surface-border" onError={e => { e.currentTarget.style.display = 'none' }} />
                <span><span className="block text-sm font-bold text-ink">{q.n}</span><span className="block text-xs text-muted">{q.r}</span></span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ({ t }: { t: Copy }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Section id="faq">
      <Reveal><Heading eyebrow={t.faq.eyebrow} title={t.faq.title} /></Reveal>
      <div className="max-w-3xl mx-auto mt-12 space-y-3">
        {t.faq.items.map((f, i) => (
          <div key={f.q} className={`rounded-2xl border bg-white overflow-hidden transition-colors ${open === i ? 'border-accent/40 shadow-card' : 'border-surface-border'}`}>
            <button className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="font-bold text-ink">{f.q}</span>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${open === i ? 'bg-accent text-white rotate-180' : 'bg-surface text-muted'}`}><ChevronDown size={16} /></span>
            </button>
            {open === i && <p className="px-6 pb-6 -mt-1 text-sm text-muted leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCTA({ t }: { t: Copy }) {
  return (
    <section className="px-5 sm:px-8 py-16 bg-surface">
      <div className="relative max-w-6xl mx-auto rounded-3xl overflow-hidden text-white text-center px-6 py-16 sm:py-20" style={{ background: NAVY }}>
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgba(37,99,235,0.5) 0%, transparent 70%)' }} />
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(70% 80% at 50% 40%, #000 40%, transparent 100%)' }} />
        <div className="relative">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance max-w-3xl mx-auto">{t.cta.title}</h2>
          <p className="mt-5 text-lg text-slate-300 max-w-xl mx-auto">{t.cta.sub}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/30 hover:bg-accent-hover hover:-translate-y-0.5 transition-all">{t.cta.cta1} <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></Link>
            <Link to="/login" className="px-7 py-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 font-semibold hover:bg-white/15 transition-colors">{t.nav.signin}</Link>
          </div>
          <p className="mt-5 text-xs text-slate-400">{t.cta.note}</p>
        </div>
      </div>
    </section>
  )
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer({ t }: { t: Copy }) {
  const columns = [
    { title: t.footer.product, items: [{ label: t.nav.features, href: '#features' }, { label: t.nav.how, href: '#how' }, { label: t.nav.faq, href: '#faq' }] },
    { title: t.footer.account, items: [{ label: t.nav.signin, to: '/login' }, { label: t.footer.create, to: '/register' }] },
    { title: t.footer.company, items: t.footer.companyItems.map(label => ({ label })) },
  ] as { title: string; items: { label: string; to?: string; href?: string }[] }[]
  return (
    <footer className="bg-ink text-slate-300">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-14 pb-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5"><span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center"><AppIcon size={19} className="text-white" /></span><span className="text-lg font-extrabold tracking-tight text-white">Plexa</span></div>
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">{t.footer.tagline}</p>
            <Link to="/register" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors">{t.cta.cta1} <ArrowRight size={15} /></Link>
          </div>
          {columns.map(col => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">{col.title}</p>
              <ul className="space-y-2.5">{col.items.map(item => (<li key={item.label}>{item.to ? <Link to={item.to} className="text-sm text-slate-300 hover:text-white transition-colors">{item.label}</Link> : item.href ? <a href={item.href} className="text-sm text-slate-300 hover:text-white transition-colors">{item.label}</a> : <span className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer">{item.label}</span>}</li>))}</ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Plexa. {t.footer.rights}</p>
          <p className="text-xs text-slate-500 text-center sm:text-right">{t.footer.disclaimer}</p>
        </div>
      </div>
    </footer>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────
function Section({ id, tone = 'gray', children }: { id?: string; tone?: 'gray' | 'navy'; children: React.ReactNode }) {
  const isNavy = tone === 'navy'
  return (
    <section id={id} className={`scroll-mt-20 px-5 sm:px-8 py-20 sm:py-24 ${isNavy ? 'text-white' : 'bg-surface'}`} style={isNavy ? { background: NAVY } : undefined}>
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  )
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <span className="text-xs font-bold uppercase tracking-widest text-accent">{eyebrow}</span>
      <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-balance">{title}</h2>
      {subtitle && <p className="mt-4 text-base text-muted leading-relaxed">{subtitle}</p>}
    </div>
  )
}
