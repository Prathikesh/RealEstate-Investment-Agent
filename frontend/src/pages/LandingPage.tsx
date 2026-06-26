import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './LandingPage.css'

// ─── ICONS ────────────────────────────────────────────────────────────────────
const TrendingUp  = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
const Zap         = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const Globe       = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
const Brain       = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>
const BarChart    = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
const Bell        = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
const DollarSign  = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
const Search      = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const CheckCircle = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
const XCircle     = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
const ArrowRight  = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
const MapPin      = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
const Star        = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const Menu        = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const Close       = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const ChevDown    = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
const Quote       = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
const Shield      = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const Sun         = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const Moon        = (p: any) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>

// ─── HOOKS ────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, seen] as const
}

function useCountUp(end: number, duration = 2000, started = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!started || end === 0) return
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(2, -10 * p)
      setVal(Math.round(eased * end))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [end, duration, started])
  return val
}

function useTyping(text: string, speed = 18, started = false) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (!started) return
    setIdx(0)
    let i = 0
    const t = setInterval(() => { i++; setIdx(i); if (i >= text.length) clearInterval(t) }, speed)
    return () => clearInterval(t)
  }, [text, speed, started])
  return text.slice(0, idx)
}

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '0,0,0'
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({ theme, onToggle }: { theme: 'dark' | 'light', onToggle: () => void }) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <nav className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="nav__inner">
        <a href="#" className="nav__logo">
          <span className="nav__logo-box"><TrendingUp width="18" height="18" /></span>
          <span className="nav__logo-text">
            <span className="nav__logo-name">QUÉBEC RE</span>
            <span className="nav__logo-tag">Investment Intelligence</span>
          </span>
        </a>

        <div className={`nav__links ${open ? 'nav__links--open' : ''}`}>
          {['Features', 'How It Works', 'Demo', 'Testimonials', 'FAQ'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g,'-')}`} onClick={() => setOpen(false)}>{l}</a>
          ))}
        </div>

        <div className="nav__actions">
          <button className="theme-toggle" onClick={onToggle} title="Toggle theme">
            {theme === 'dark' ? <Sun width="16" height="16" /> : <Moon width="16" height="16" />}
          </button>
          <button className="btn-ghost-sm" onClick={() => navigate('/dashboard')}>Sign In</button>
          <button className="btn-accent" onClick={() => navigate('/dashboard')}>Start Free Trial</button>
        </div>

        <button className="nav__burger" onClick={() => setOpen(x => !x)}>
          {open ? <Close width="22" height="22" /> : <Menu width="22" height="22" />}
        </button>
      </div>
    </nav>
  )
}

// ─── MINI PROPERTY CARD (HERO DASHBOARD) ─────────────────────────────────────
function PropCard({ price, addr, score, label, cap, cf, img, delay }: any) {
  const C: any = {
    'Strong Opportunity':  { bg:'rgba(5,150,105,.14)',  br:'rgba(5,150,105,.4)',  tx:'#34D399', sc:'#059669' },
    'Worth Investigating': { bg:'rgba(37,99,235,.14)',  br:'rgba(37,99,235,.4)',  tx:'#60A5FA', sc:'#2563EB' },
    'Market Price':        { bg:'rgba(217,119,6,.14)',  br:'rgba(217,119,6,.4)',  tx:'#FBBF24', sc:'#D97706' },
  }
  const c = C[label] || C['Worth Investigating']
  return (
    <div className="prop-card" style={{ animationDelay: `${delay}s` }}>
      <div className="prop-card__img" style={{ backgroundImage: `url(${img})` }}>
        <span className="prop-card__score" style={{ background: c.sc }}>{score}</span>
      </div>
      <div className="prop-card__body">
        <p className="prop-card__price">{price}</p>
        <p className="prop-card__addr">{addr}</p>
        <span className="prop-card__label" style={{ background: c.bg, borderColor: c.br, color: c.tx }}>{label}</span>
        <div className="prop-card__row">
          <div><span className="pk">Cap</span><span className="pv">{cap}</span></div>
          <div><span className="pk">CF/mo</span><span className="pv green">{cf}</span></div>
        </div>
        <div className="prop-card__ai"><span className="pulse-dot" />AI verdict ready</div>
      </div>
    </div>
  )
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate()
  return (
    <section className="hero" id="hero">
      <div className="hero__glow hero__glow--1" />
      <div className="hero__glow hero__glow--2" />
      <div className="hero__grid" />

      <div className="hero__inner">
        <div className="hero__copy">
          <div className="chip chip--glow">
            <Zap width="12" height="12" />
            AI-Powered · Updated every 6 hours
          </div>

          <h1 className="hero__h1">
            Stop Browsing<br />
            <span className="grad">Listings.</span><br />
            Start Finding Deals.
          </h1>

          <p className="hero__sub">
            Our AI scans every property on Centris, Realtor.ca, and ReMax across Quebec —
            scoring investment potential with cap rates, cash flow projections, and bilingual AI
            verdicts before you make a single call.
          </p>

          <div className="hero__ctas">
            <button className="btn-accent btn-accent--lg btn-glow" onClick={() => navigate('/dashboard')}>
              Analyze Properties Free
              <ArrowRight width="17" height="17" />
            </button>
            <button className="btn-outline-lg">Watch 90-second Demo</button>
          </div>

          <div className="hero__proof">
            <div className="avatars">
              {[['JL','#2563EB'],['MR','#059669'],['AP','#7C3AED'],['SC','#D97706'],['NK','#EC4899']].map(([i,bg],k) => (
                <span key={k} className="av" style={{ background: bg, marginLeft: k ? '-9px' : 0 }}>{i}</span>
              ))}
            </div>
            <div>
              <div className="stars">{[1,2,3,4,5].map(i => <Star key={i} width="13" height="13" />)}</div>
              <span className="hero__proof-label">Trusted by 500+ Quebec investors</span>
            </div>
          </div>
        </div>

        <div className="hero__visual">
          <div className="dash">
            <div className="dash__chrome">
              <span className="dot r" /><span className="dot y" /><span className="dot g" />
              <div className="dash__url">québec-re.app/dashboard</div>
              <div className="dash__live"><span className="blink-dot" />Live</div>
            </div>

            <div className="dash__metrics">
              {[['847','Listings',null],['23','Strong Buys','#34D399'],['12','Price Drops','#FBBF24']].map(([v,l,c])=>(
                <div key={l} className="dash__m">
                  <span className="dash__mv" style={c ? {color:c} : {}}>{v}</span>
                  <span className="dash__ml">{l}</span>
                </div>
              ))}
            </div>

            <div className="dash__cards">
              <PropCard price="$485,000" addr="1234 Rue Sherbrooke, Mtl" score={87} label="Strong Opportunity"
                cap="6.8%" cf="+$1,240" delay={0.1}
                img="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=320&q=80" />
              <PropCard price="$329,000" addr="456 Blvd René-Lévesque, QC" score={62} label="Worth Investigating"
                cap="4.2%" cf="+$520" delay={0.22}
                img="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=320&q=80" />
              <PropCard price="$275,000" addr="89 Rue Saint-Denis, Laval" score={44} label="Market Price"
                cap="3.1%" cf="+$180" delay={0.34}
                img="https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=320&q=80" />
            </div>
          </div>

          <div className="float-card float-card--verdict">
            <span className="blink-dot blink-dot--green" />
            <div>
              <p className="float-card__label">AI Verdict · Score 87</p>
              <p className="float-card__text">"Exceptional 6.8% cap rate, 47% above Montreal avg…"</p>
            </div>
            <span className="float-card__badge">STRONG</span>
          </div>

          <div className="float-card float-card--alert">
            <Bell width="13" height="13" style={{ color:'#FBBF24', flexShrink:0 }} />
            <span>Price drop — 221 Rue Bishop · $18k below comps</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── MARQUEE ─────────────────────────────────────────────────────────────────
function Marquee() {
  const items = [
    '✦ Centris.ca', '✦ Realtor.ca', '✦ ReMax Québec',
    '✦ 847 Active Listings', '✦ AI-Powered Analysis', '✦ Bilingual EN/FR',
    '✦ 6-Hour Refresh Cycle', '✦ No Manual Research',
    '✦ Centris.ca', '✦ Realtor.ca', '✦ ReMax Québec',
    '✦ 847 Active Listings', '✦ AI-Powered Analysis', '✦ Bilingual EN/FR',
    '✦ 6-Hour Refresh Cycle', '✦ No Manual Research',
  ]
  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {items.map((t, i) => <span key={i} className="marquee-item">{t}</span>)}
      </div>
    </div>
  )
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function StatNum({ end, suffix = '', started }: any) {
  const val = useCountUp(end, 2200, started)
  return <span className="stat__val">{val}{suffix}</span>
}

function Stats() {
  const [ref, seen] = useInView(0.3)
  const items = [
    { end: 500, suffix: '+', label: 'Properties Analyzed Daily' },
    { end: 95,  suffix: '%', label: 'Investor Satisfaction Score' },
    { end: 3,   suffix: '',  label: 'Major Platforms Unified' },
    { end: 6,   suffix: 'h', label: 'Data Refresh Cycle' },
  ]
  return (
    <div className="stats" ref={ref as any}>
      {items.map(({ end, suffix, label }, i) => (
        <div key={i} className={`stat ${seen ? 'stat--visible' : ''}`} style={{ transitionDelay: `${i * 0.1}s` }}>
          <StatNum end={end} suffix={suffix} started={seen} />
          <span className="stat__label">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── PROBLEM ─────────────────────────────────────────────────────────────────
function Problem() {
  const [ref, seen] = useInView()
  const before = [
    'Manually browse 3+ websites for hours',
    'Guess at cap rates with a spreadsheet',
    'Miss deals while you are still researching',
    'No way to compare properties side-by-side',
    'English-only tools miss Quebec nuances',
    'Overpay because you lack comparable data',
  ]
  const after = [
    'AI scans 500+ listings while you sleep',
    'Instant cap rate, NOI & cash flow calculations',
    'Real-time alerts the moment a deal appears',
    'Side-by-side comparison dashboard',
    'Full bilingual analysis (English + French)',
    'Comparable sales validation on every listing',
  ]
  return (
    <section className="section problem-section" ref={ref as any}>
      <div className="container">
        <div className="section-head">
          <div className="chip">The Problem</div>
          <h2 className="section-h2">Most investors are flying blind</h2>
          <p className="section-sub">By the time you analyze a listing manually, the best deals are already gone.</p>
        </div>

        <div className="problem-grid">
          <div className={`problem-col problem-col--before ${seen ? 'visible' : ''}`}>
            <div className="problem-col__head">
              <span className="problem-icon problem-icon--before">✕</span>
              <h3>The Old Way</h3>
            </div>
            {before.map((item, i) => (
              <div key={i} className="problem-row problem-row--before" style={{ transitionDelay: `${i * 0.06}s` }}>
                <XCircle width="16" height="16" style={{ color: '#EF4444', flexShrink: 0 }} />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="problem-divider">
            <div className="problem-divider__line" />
            <div className="problem-divider__badge">VS</div>
            <div className="problem-divider__line" />
          </div>

          <div className={`problem-col problem-col--after ${seen ? 'visible' : ''}`} style={{ transitionDelay: '0.1s' }}>
            <div className="problem-col__head">
              <span className="problem-icon problem-icon--after">✓</span>
              <h3>With Québec RE</h3>
            </div>
            {after.map((item, i) => (
              <div key={i} className="problem-row problem-row--after" style={{ transitionDelay: `${i * 0.06 + 0.1}s` }}>
                <CheckCircle width="16" height="16" style={{ color: '#34D399', flexShrink: 0 }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── FEATURES ────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: Globe,      color: '#2563EB', title: 'Multi-Source Aggregation',
    desc: 'Scrapes Centris.ca, Realtor.ca, and ReMax Québec every 6 hours. Smart deduplication across MLS numbers and agent fingerprints delivers one clean, unified feed.' },
  { icon: Brain,      color: '#7C3AED', title: 'AI Investment Scoring',
    desc: 'Every listing receives a 0–100 score across cap rate, cash flow, location demand, comparable sales, and market momentum — evaluated simultaneously by our proprietary AI engine.' },
  { icon: DollarSign, color: '#059669', title: 'Instant Financial Calculator',
    desc: 'NOI, cap rate, monthly cash flow, mortgage estimate, welcome tax (droits de mutation), and total ROI — all precomputed. No spreadsheet required.' },
  { icon: Search,     color: '#D97706', title: 'Comparable Finder',
    desc: 'Automatically surfaces recently sold similar properties nearby, validating the asking price and flagging undervalued listings before they disappear from the market.' },
  { icon: Bell,       color: '#EC4899', title: 'Real-Time Market Alerts',
    desc: 'Instant notifications when strong opportunities appear, prices drop on watched properties, or new listings match your saved search criteria. Never miss a deal.' },
  { icon: BarChart,   color: '#06B6D4', title: 'Bilingual AI Verdicts',
    desc: 'Our AI generates a clear 2–3 sentence investment brief in both English and French for every property. Instant clarity without wading through raw numbers.' },
]

function Features() {
  const [ref, seen] = useInView()
  return (
    <section className="section" id="features" ref={ref as any}>
      <div className="container">
        <div className="section-head">
          <div className="chip">Features</div>
          <h2 className="section-h2">Stop doing what a computer can do better</h2>
          <p className="section-sub">Six capabilities working together — so you can spend your time on what only you can do: making the call.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map(({ icon: Icon, color, title, desc }, i) => (
            <div key={i} className={`feat-card ${seen ? 'feat-card--visible' : ''}`} style={{ transitionDelay: `${i * 0.07}s` }}>
              <div className="feat-card__icon" style={{
                background: `rgba(${hexToRgb(color)},.1)`,
                borderColor: `rgba(${hexToRgb(color)},.22)`,
                color,
              }}>
                <Icon width="22" height="22" />
              </div>
              <h3 className="feat-card__title">{title}</h3>
              <p className="feat-card__desc">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const [ref, seen] = useInView()
  const steps = [
    { num:'01', icon: Globe,      color:'#2563EB',
      title:'We Scrape. You Relax.',
      desc: 'Our system crawls Centris, Realtor.ca, and ReMax Québec on a 6-hour cycle using anti-bot infrastructure. Cross-source deduplication produces one clean dataset of every active listing.' },
    { num:'02', icon: Brain,      color:'#7C3AED',
      title:'AI Analyzes Every Property',
      desc: 'Each listing runs through a 4-stage AI pipeline: Comparable Finder → Financial Calculator → Opportunity Scorer → Bilingual Brief Generator. Automated. Every single run.' },
    { num:'03', icon: TrendingUp, color:'#059669',
      title:'You Invest with Confidence',
      desc: 'Browse ranked properties with scores, AI verdicts, and financial metrics. Filter by cap rate, city, price, or score. Make data-backed decisions in minutes instead of days.' },
  ]
  return (
    <section className="section hiw" id="how-it-works" ref={ref as any}>
      <div className="container">
        <div className="section-head">
          <div className="chip">How It Works</div>
          <h2 className="section-h2">From listing to verdict in under a minute</h2>
          <p className="section-sub">A 24/7 automated pipeline that keeps you ahead of the market — without you lifting a finger.</p>
        </div>

        <div className="hiw__steps">
          {steps.map(({ num, icon: Icon, color, title, desc }, i) => (
            <div key={i} className={`hiw__step ${seen ? 'hiw__step--visible' : ''}`} style={{ transitionDelay: `${i * 0.14}s` }}>
              <div className="hiw__step-num" style={{ color }}>{num}</div>
              <div className="hiw__step-icon" style={{ background: `rgba(${hexToRgb(color)},.1)`, color }}>
                <Icon width="30" height="30" />
              </div>
              <h3 className="hiw__step-title">{title}</h3>
              <p className="hiw__step-desc">{desc}</p>
              {i < steps.length - 1 && <div className="hiw__connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── AI DEMO ──────────────────────────────────────────────────────────────────
const VERDICT_EN = `This triplex in Plateau-Mont-Royal delivers a 6.8% cap rate — 47% above the Montreal market average of 4.2%. Consistent rental demand in this neighborhood and the below-comp asking price create immediate positive cash flow of $1,240/month with standard 20% down financing.`
const VERDICT_FR = `Ce triplex au Plateau-Mont-Royal offre un taux de capitalisation de 6,8%, supérieur de 47% à la moyenne montréalaise de 4,2%. La forte demande locative et le prix sous les comparables génèrent un flux de trésorerie positif de 1 240$/mois dès le départ.`

function AIDemo() {
  const [ref, seen] = useInView(0.25)
  const en = useTyping(VERDICT_EN, 15, seen)
  const fr = useTyping(VERDICT_FR, 18, seen)

  return (
    <section className="section demo-section" id="demo" ref={ref as any}>
      <div className="container">
        <div className="demo-grid">
          <div className={`demo-copy ${seen ? 'demo-copy--visible' : ''}`}>
            <div className="chip">AI Analysis</div>
            <h2 className="section-h2 section-h2--left">Verdict in seconds. Not in hours.</h2>
            <p className="section-sub section-sub--left">
              Our AI analyzes each property across 12+ dimensions and surfaces a clear verdict — so you know
              what you're looking at before you make a single call.
            </p>
            <ul className="checklist">
              {['Cap rate & NOI calculation','Welcome tax (droits de mutation)','Comparable sales validation','Neighborhood trend assessment','Bilingual verdict — EN + FR','Investment score 0 – 100'].map((t,i)=>(
                <li key={i}><CheckCircle width="16" height="16" style={{ color:'#34D399' }} />{t}</li>
              ))}
            </ul>
          </div>

          <div className={`demo-card ${seen ? 'demo-card--visible' : ''}`}>
            <div className="dc-header">
              <img src="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=80&q=80" className="dc-img" alt="property" />
              <div className="dc-info">
                <p className="dc-price">$485,000</p>
                <p className="dc-addr">1234 Rue Sherbrooke, Montréal</p>
                <span className="dc-badge dc-badge--strong">Strong Opportunity</span>
              </div>
              <div className="dc-score dc-score--strong">87</div>
            </div>

            <div className="dc-metrics">
              {[['Cap Rate','6.8%',false],['Annual NOI','$32,980',false],['Cash Flow / mo','+$1,240',true],['Welcome Tax','$6,750',false]].map(([k,v,g])=>(
                <div key={k as string} className="dcm"><span className="dcm-k">{k}</span><span className={`dcm-v ${g?'dcm-v--pos':''}`}>{v}</span></div>
              ))}
            </div>

            <div className="dc-verdict dc-verdict--en">
              <div className="dc-verdict__label"><span className="pulse-dot pulse-dot--blue" />AI Verdict · English</div>
              <p className="dc-verdict__text">{en || '…'}<span className="cursor">|</span></p>
            </div>

            <div className="dc-verdict dc-verdict--fr">
              <div className="dc-verdict__label"><span className="pulse-dot pulse-dot--purple" />Verdict IA · Français</div>
              <p className="dc-verdict__text">{fr || '…'}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: 'Jean-Luc Bouchard',
    role: 'Real Estate Investor · Montréal',
    avatar: '#2563EB',
    initials: 'JB',
    stars: 5,
    quote: 'I found a triplex in Laval with a 7.2% cap rate that I never would have noticed scrolling Centris manually. The AI verdict flagged it immediately. I closed 3 weeks later. This tool has already paid for itself 10x over.',
  },
  {
    name: 'Marie-Claire Tremblay',
    role: 'Portfolio Manager · Québec City',
    avatar: '#059669',
    initials: 'MT',
    stars: 5,
    quote: 'The bilingual verdicts are a genuine game changer. The French analysis captures nuances of the Quebec market — local terminology, tax implications, neighborhood dynamics — that English-only tools completely miss.',
  },
  {
    name: 'Priya Mehta',
    role: 'Investor · 12 properties across QC',
    avatar: '#7C3AED',
    initials: 'PM',
    stars: 5,
    quote: 'I used to spend every Sunday doing market research across 3 platforms. Now it takes 20 minutes. The comparable finder alone saves me hours of cross-referencing. The ROI on this subscription is, frankly, absurd.',
  },
]

function Testimonials() {
  const [ref, seen] = useInView()
  return (
    <section className="section" id="testimonials" ref={ref as any}>
      <div className="container">
        <div className="section-head">
          <div className="chip">Testimonials</div>
          <h2 className="section-h2">Investors who found their edge</h2>
          <p className="section-sub">Real results from Quebec investors who stopped guessing and started winning deals.</p>
        </div>

        <div className="testi-grid">
          {TESTIMONIALS.map(({ name, role, avatar, initials, quote }, i) => (
            <div key={i} className={`testi-card ${seen ? 'testi-card--visible' : ''}`} style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="testi-card__top">
                <Quote width="28" height="28" className="testi-quote-icon" />
              </div>
              <p className="testi-card__quote">"{quote}"</p>
              <div className="testi-card__author">
                <span className="testi-av" style={{ background: avatar }}>{initials}</span>
                <div>
                  <p className="testi-name">{name}</p>
                  <p className="testi-role">{role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── COVERAGE ────────────────────────────────────────────────────────────────
const CITIES = [
  'Montréal', 'Québec City', 'Laval', 'Longueuil', 'Gatineau',
  'Sherbrooke', 'Saguenay', 'Trois-Rivières', 'Terrebonne', 'Brossard',
  'Saint-Jean-sur-Richelieu', 'Repentigny',
]

function Coverage() {
  const [ref, seen] = useInView()
  return (
    <section className="section coverage-section" ref={ref as any}>
      <div className="container">
        <div className="cov-grid">
          <div className={`cov-copy ${seen ? 'cov-copy--visible' : ''}`}>
            <div className="chip">Coverage</div>
            <h2 className="section-h2 section-h2--left">All of Quebec. Covered.</h2>
            <p className="section-sub section-sub--left">
              12 cities. 3 platforms. Every active listing — aggregated, deduplicated, and scored
              in one dashboard updated every 6 hours.
            </p>
            <div className="city-tags">
              {CITIES.map((c, i) => (
                <span key={i} className="city-tag"><MapPin width="9" height="9" />{c}</span>
              ))}
            </div>
            <div className="source-row">
              {['Centris.ca', 'Realtor.ca', 'ReMax QC'].map(s => (
                <span key={s} className="source-chip"><Shield width="11" height="11" />{s}</span>
              ))}
            </div>
          </div>

          <div className={`cov-visual ${seen ? 'cov-visual--visible' : ''}`}>
            <div className="cov-img-wrap">
              <img
                src="https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=700&q=85"
                alt="Montréal cityscape at dusk"
                className="cov-img"
              />
              <div className="cov-img-overlay">
                {[['12+','Cities'],['3','Platforms'],['6h','Refresh']].map(([v,l]) => (
                  <div key={l} className="cov-stat"><span className="cov-stat__val">{v}</span><span className="cov-stat__lbl">{l}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How often are listings updated?',
    a: 'Our system automatically crawls Centris.ca, Realtor.ca, and ReMax Québec every 6 hours using anti-bot infrastructure. This means your dashboard is refreshed 4 times per day — so you see price drops, new listings, and status changes as soon as they happen.' },
  { q: 'How is the investment score calculated?',
    a: 'Each property is scored 0–100 by our proprietary AI pipeline across 12 dimensions: cap rate, net operating income, cash flow, price-to-comparable ratio, neighborhood rental demand, listing days-on-market, price trend, welcome tax burden, mortgage serviceability, and more.' },
  { q: 'What property types are supported?',
    a: 'We support multi-family (triplexes, fourplexes, apartment buildings), single-family homes, condos, and small commercial properties across Quebec. The financial calculator is specifically calibrated for Quebec real estate regulations and welcome tax brackets.' },
  { q: 'Is there a free trial? Do I need a credit card?',
    a: 'Yes — you get a full 14-day free trial with access to all features, all listings, and unlimited AI verdicts. No credit card is required to start. You only enter payment details if you decide to continue after the trial.' },
  { q: 'What makes this different from just using Centris or Realtor.ca?',
    a: "Those platforms show you listings — we show you investments. We unify all three platforms, eliminate duplicates, calculate financial metrics, find comparable sales, and generate AI investment verdicts for every property. Instead of browsing, you're reviewing ranked opportunities." },
  { q: 'Can I cancel anytime?',
    a: 'Absolutely. No contracts, no cancellation fees, no questions asked. You can cancel directly from your account settings in under 30 seconds. If you cancel mid-cycle, you retain access for the remainder of your billing period.' },
]

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  const [ref, seen] = useInView()
  const toggle = (i: number) => setOpen(x => x === i ? null : i)

  return (
    <section className="section" id="faq" ref={ref as any}>
      <div className="container">
        <div className="section-head">
          <div className="chip">FAQ</div>
          <h2 className="section-h2">Questions we get asked a lot</h2>
          <p className="section-sub">Everything you need to know before you start. Still have questions? Reach us at hello@quebec-re.app</p>
        </div>

        <div className="faq-list">
          {FAQS.map(({ q, a }, i) => (
            <div
              key={i}
              className={`faq-item ${open === i ? 'faq-item--open' : ''} ${seen ? 'faq-item--visible' : ''}`}
              style={{ transitionDelay: `${i * 0.06}s` }}
            >
              <button className="faq-item__q" onClick={() => toggle(i)}>
                <span>{q}</span>
                <ChevDown width="18" height="18" className="faq-item__arrow" />
              </button>
              <div className="faq-item__body">
                <p className="faq-item__a">{a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────────────
function CTA() {
  const navigate = useNavigate()
  return (
    <section className="cta-section">
      <div className="cta-section__glow" />
      <div className="cta-section__inner">
        <div className="cta-section__eyebrow">
          <Zap width="13" height="13" />
          No credit card · 14-day free trial · Cancel anytime
        </div>
        <h2 className="cta-section__h2">
          Your next deal is already listed.<br />
          <span className="grad">Will you find it first?</span>
        </h2>
        <p className="cta-section__p">
          Every hour you wait, investors with better tools are reviewing the same listings. Start your
          free trial now and let AI do the scouting.
        </p>
        <button className="btn-accent btn-accent--lg btn-glow cta-section__btn" onClick={() => navigate('/dashboard')}>
          Start Analyzing Free — No CC Required
          <ArrowRight width="18" height="18" />
        </button>
        <div className="cta-section__trust">
          <span><CheckCircle width="14" height="14" /> Instant setup</span>
          <span><CheckCircle width="14" height="14" /> Full feature access</span>
          <span><CheckCircle width="14" height="14" /> Cancel in 30 seconds</span>
        </div>
      </div>
    </section>
  )
}

// ─── FOOTER ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__top">
          <div className="footer__brand">
            <a href="#" className="nav__logo" style={{ marginBottom: 14, display:'inline-flex' }}>
              <span className="nav__logo-box"><TrendingUp width="16" height="16" /></span>
              <span className="nav__logo-text">
                <span className="nav__logo-name">QUÉBEC RE</span>
                <span className="nav__logo-tag">Investment Intelligence</span>
              </span>
            </a>
            <p className="footer__brand-desc">
              AI-powered real estate investment analysis purpose-built for the Quebec market. Find the best
              deals before everyone else.
            </p>
            <div className="footer__badges">
              <span>AI-Powered</span>
              <span>SOC 2 Ready</span>
            </div>
          </div>

          <div className="footer__cols">
            {[
              { h: 'Product',  links: ['Features','How It Works','Live Demo','Pricing','Changelog'] },
              { h: 'Company',  links: ['About','Blog','Careers','Contact','Press'] },
              { h: 'Legal',    links: ['Privacy Policy','Terms of Service','Cookie Policy','GDPR'] },
            ].map(({ h, links }) => (
              <div key={h} className="footer__col">
                <h4>{h}</h4>
                {links.map(l => <a key={l} href="#">{l}</a>)}
              </div>
            ))}
          </div>
        </div>

        <div className="footer__bottom">
          <span>© 2026 Québec RE Inc. All rights reserved.</span>
          <span>Crafted with precision for Quebec investors</span>
        </div>
      </div>
    </footer>
  )
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return (
    <div className={`app app--${theme}`}>
      <Navbar theme={theme} onToggle={toggleTheme} />
      <Hero />
      <Marquee />
      <Stats />
      <Problem />
      <Features />
      <HowItWorks />
      <AIDemo />
      <Testimonials />
      <Coverage />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  )
}
