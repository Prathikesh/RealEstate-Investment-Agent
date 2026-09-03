import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Sparkles, Building2, Bell, Star } from 'lucide-react'
import { AppIcon, AppWordmark } from '../components/QuartisLogo'
import { useLang } from '../context/LanguageContext'

const NAVY = 'radial-gradient(120% 120% at 15% 0%, #1E3A5F 0%, #131b2e 45%, #0b1120 100%)'

const PANEL = {
  en: {
    headline: 'The unfair advantage for Quebec real-estate investors.',
    vps: [
      { Icon: Sparkles, text: 'AI-scored deals across the entire Quebec market' },
      { Icon: Building2, text: 'Development potential from official Quebec zoning' },
      { Icon: Bell, text: 'Instant alerts when an undervalued property appears' },
    ],
    chip: 'Strong buy',
    quote: 'I found a triplex 12% under market the morning it was listed.',
    quoteName: 'Marc-André L.', quoteRole: 'Plex investor · Montréal',
    trust: 'Built on official government data — verifiable, never guessed.',
    back: 'Back to home',
  },
  fr: {
    headline: 'L’avantage décisif pour les investisseurs immobiliers du Québec.',
    vps: [
      { Icon: Sparkles, text: 'Occasions notées par IA sur tout le marché québécois' },
      { Icon: Building2, text: 'Potentiel de développement à partir du zonage officiel' },
      { Icon: Bell, text: 'Alertes instantanées dès qu’une propriété sous-évaluée paraît' },
    ],
    chip: 'Achat fort',
    quote: 'J’ai trouvé un triplex 12 % sous le marché le matin de son inscription.',
    quoteName: 'Marc-André L.', quoteRole: 'Investisseur en plex · Montréal',
    trust: 'Fondé sur des données gouvernementales officielles — vérifiable, jamais deviné.',
    back: 'Retour à l’accueil',
  },
}

export default function AuthLayout({
  eyebrow, title, subtitle, children, footer,
}: {
  eyebrow: string; title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode
}) {
  const { lang, setLang } = useLang()
  const p = PANEL[lang] ?? PANEL.en
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface">
      {/* ── Brand panel ──────────────────────────────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-11 xl:p-12 text-white" style={{ background: NAVY }}>
        <div aria-hidden className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(40% 40% at 85% 10%, rgba(37,99,235,0.55) 0%, transparent 70%)' }} />
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(90% 70% at 50% 30%, #000 40%, transparent 100%)' }} />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <AppIcon size={34} />
            <span className="text-2xl font-extrabold tracking-tight text-white">PlexAi</span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2rem] leading-[1.14] font-extrabold tracking-tight text-balance">{p.headline}</h2>

          {/* live deal preview — makes the panel feel like the real product */}
          <div className="mt-7 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur p-3.5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg,#93c5fd,#2563eb)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white truncate">1195 Rue Saint-Hubert</p>
              <p className="text-[11px] text-slate-400">Ville-Marie · Triplex · $1,039,000</p>
            </div>
            <div className="text-center shrink-0">
              <span className="w-9 h-9 rounded-full bg-score-strong text-white text-sm font-extrabold flex items-center justify-center">82</span>
              <span className="text-[8px] font-bold text-score-strong uppercase tracking-wide">{p.chip}</span>
            </div>
          </div>

          <ul className="mt-6 space-y-3.5">
            {p.vps.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center"><Icon size={15} className="text-blue-200" /></span>
                <span className="text-[14px] text-slate-200/90 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* testimonial */}
        <div className="relative rounded-2xl bg-white/[0.06] ring-1 ring-white/10 p-4">
          <div className="flex gap-0.5 mb-2 text-amber-300">{Array.from({ length: 5 }).map((_, k) => (<Star key={k} size={12} className="fill-current" />))}</div>
          <p className="text-[13px] text-slate-200 leading-snug">“{p.quote}”</p>
          <div className="mt-3 flex items-center gap-2.5">
            <img src="https://randomuser.me/api/portraits/men/32.jpg" alt={p.quoteName} className="w-8 h-8 rounded-full object-cover ring-2 ring-white/15" onError={e => { e.currentTarget.style.display = 'none' }} />
            <span className="text-[12px]"><span className="block font-bold text-white leading-tight">{p.quoteName}</span><span className="block text-slate-400">{p.quoteRole}</span></span>
          </div>
        </div>
      </aside>

      {/* ── Form panel ───────────────────────────────────────────────────── */}
      <main className="relative flex flex-col justify-center px-6 py-10 sm:px-10">
        {/* lang toggle */}
        <div className="absolute top-5 right-5 flex items-center rounded-lg p-0.5 text-xs font-bold bg-surface">
          {(['en', 'fr'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 rounded-md transition-colors ${lang === l ? 'bg-accent text-white' : 'text-muted'}`}>{l.toUpperCase()}</button>
          ))}
        </div>

        <div className="w-full max-w-[380px] mx-auto">
          <Link to="/" className="lg:hidden inline-flex items-center mb-8">
            <AppWordmark iconSize={24} />
          </Link>
          <Link to="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-8"><ArrowLeft size={15} /> {p.back}</Link>

          <p className="text-xs font-bold uppercase tracking-widest text-accent mb-2">{eyebrow}</p>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight text-balance">{title}</h1>
          <p className="text-sm text-muted mt-1.5">{subtitle}</p>

          <div className="mt-7">{children}</div>
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted/70">
            <ShieldCheck size={14} className="text-accent" /> {p.trust}
          </div>
        </div>
      </main>
    </div>
  )
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-white text-sm text-ink placeholder:text-muted/60 transition-shadow focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" />
    </label>
  )
}

export function SubmitButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-bold shadow-sm hover:bg-accent-hover hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
      {children}
    </button>
  )
}
