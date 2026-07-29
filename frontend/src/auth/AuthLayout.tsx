import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Sparkles, Building2, Bell } from 'lucide-react'
import { AppIcon } from '../components/QuartisLogo'

const VALUE_PROPS = [
  { Icon: Sparkles,   text: 'AI-scored deals across Centris, Realtor.ca & Remax' },
  { Icon: Building2,  text: 'Development potential from official Quebec zoning data' },
  { Icon: Bell,       text: 'Instant alerts the moment an undervalued property appears' },
]

export default function AuthLayout({
  eyebrow, title, subtitle, children, footer,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface">
      {/* ── Brand panel (left, desktop) ─────────────────────────────────── */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white"
        style={{ background: 'radial-gradient(120% 120% at 15% 0%, #1E3A5F 0%, #131b2e 45%, #0b1120 100%)' }}
      >
        {/* ambient glow + grid */}
        <div aria-hidden className="absolute inset-0 opacity-[0.35]"
             style={{ background: 'radial-gradient(40% 40% at 80% 15%, rgba(37,99,235,0.55) 0%, transparent 70%)' }} />
        <div aria-hidden className="absolute inset-0"
             style={{
               backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)',
               backgroundSize: '44px 44px', maskImage: 'radial-gradient(90% 70% at 50% 30%, #000 40%, transparent 100%)',
             }} />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
              <AppIcon size={22} className="text-white" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Arpent</span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.1rem] leading-[1.12] font-extrabold tracking-tight text-balance">
            The unfair advantage for Quebec real-estate investors.
          </h2>
          <ul className="mt-8 space-y-4">
            {VALUE_PROPS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
                  <Icon size={16} className="text-blue-200" />
                </span>
                <span className="text-[15px] text-slate-200/90 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-slate-300/80">
          <ShieldCheck size={15} className="text-blue-300" />
          Built on official government data — verifiable, never guessed.
        </div>
      </aside>

      {/* ── Form panel (right) ──────────────────────────────────────────── */}
      <main className="flex flex-col justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[380px] mx-auto">
          {/* mobile logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-2 mb-8">
            <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-md">
              <AppIcon size={19} className="text-white" />
            </span>
            <span className="text-base font-extrabold tracking-tight text-ink">Arpent</span>
          </Link>

          <Link to="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-8">
            <ArrowLeft size={15} /> Back to home
          </Link>

          <p className="text-xs font-bold uppercase tracking-widest text-accent mb-2">{eyebrow}</p>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">{title}</h1>
          <p className="text-sm text-muted mt-1.5">{subtitle}</p>

          <div className="mt-7">{children}</div>

          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        </div>
      </main>
    </div>
  )
}

// Shared field + submit styles so both auth forms match.
export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink mb-1.5">{label}</span>
      <input
        {...props}
        className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-white text-sm text-ink
                   placeholder:text-muted/60 transition-shadow
                   focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
    </label>
  )
}

export function SubmitButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-bold shadow-sm
                 hover:bg-accent-hover hover:shadow-md active:scale-[0.99]
                 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
