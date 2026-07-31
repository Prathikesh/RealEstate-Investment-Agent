import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'
import { useLang } from '../context/LanguageContext'
import AuthLayout, { Field, SubmitButton } from './AuthLayout'
import GoogleButton from './GoogleButton'

interface LocationState { from?: { pathname: string } }

const COPY = {
  en: { eyebrow: 'Welcome back', title: 'Sign in to Plexa', subtitle: 'Your Quebec deal pipeline is one click away.', email: 'Email', password: 'Password', forgot: 'Forgot?', submit: 'Sign in', submitting: 'Signing in…', noAccount: "Don’t have an account?", create: 'Create one free', err: 'Invalid email or password', or: 'or', google: 'Sign in with Google' },
  fr: { eyebrow: 'Bon retour', title: 'Connexion à Plexa', subtitle: 'Votre pipeline d’occasions au Québec, à un clic.', email: 'Courriel', password: 'Mot de passe', forgot: 'Oublié ?', submit: 'Se connecter', submitting: 'Connexion…', noAccount: 'Pas encore de compte ?', create: 'Créez-en un gratuitement', err: 'Courriel ou mot de passe invalide', or: 'ou', google: 'Se connecter avec Google' },
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_auth_failed: "Something went wrong signing in with Google — please try again.",
  account_disabled: "This account has been disabled. Contact an admin if that's unexpected.",
}

export default function Login() {
  const { login } = useAuth()
  const { lang } = useLang()
  const c = COPY[lang] ?? COPY.en
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => {
    const code = searchParams.get('error')
    return code ? OAUTH_ERROR_MESSAGES[code] ?? 'Sign-in failed — please try again.' : null
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setSubmitting(true)
    try {
      await login({ email, password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, c.err))
    } finally { setSubmitting(false) }
  }

  return (
    <AuthLayout
      eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle}
      footer={<>{c.noAccount}{' '}<Link to="/register" className="text-accent font-semibold hover:underline">{c.create}</Link></>}
    >
      {error && <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={c.email} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-semibold text-ink">{c.password}</span>
            <span className="text-xs text-muted/70">{c.forgot}</span>
          </div>
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-white text-sm text-ink placeholder:text-muted/60 transition-shadow focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" />
        </div>
        <SubmitButton type="submit" disabled={submitting}>{submitting ? c.submitting : c.submit}</SubmitButton>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-surface-border" />
        <span className="text-xs text-muted">{c.or}</span>
        <div className="flex-1 h-px bg-surface-border" />
      </div>

      <GoogleButton label={c.google} />
    </AuthLayout>
  )
}
