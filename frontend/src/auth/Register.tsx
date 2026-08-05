import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'
import { useLang } from '../context/LanguageContext'
import AuthLayout, { Field, SubmitButton } from './AuthLayout'
import GoogleButton from './GoogleButton'

const COPY = {
  en: { eyebrow: 'Get started — free', title: 'Create your PlexAI account', subtitle: 'Find undervalued Quebec properties — scored, analyzed and alerted for you, in minutes.', name: 'Name', email: 'Email', password: 'Password', pwph: 'At least 8 characters', submit: 'Create free account', submitting: 'Creating account…', have: 'Already have an account?', signin: 'Sign in', note: 'No credit card required · Cancel anytime', pwErr: 'Password must be at least 8 characters', err: 'Could not create your account', or: 'or', google: 'Sign up with Google' },
  fr: { eyebrow: 'Commencez — gratuit', title: 'Créez votre compte PlexAI', subtitle: 'Trouvez des propriétés québécoises sous-évaluées — notées, analysées et signalées pour vous, en quelques minutes.', name: 'Nom', email: 'Courriel', password: 'Mot de passe', pwph: 'Au moins 8 caractères', submit: 'Créer un compte gratuit', submitting: 'Création du compte…', have: 'Vous avez déjà un compte ?', signin: 'Se connecter', note: 'Aucune carte de crédit requise · Annulez en tout temps', pwErr: 'Le mot de passe doit contenir au moins 8 caractères', err: 'Impossible de créer votre compte', or: 'ou', google: 'S’inscrire avec Google' },
}

export default function Register() {
  const { register } = useAuth()
  const { lang } = useLang()
  const c = COPY[lang] ?? COPY.en
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError(c.pwErr); return }
    setSubmitting(true)
    try {
      await register({ email, password, name: name || undefined })
      navigate('/', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, c.err))
    } finally { setSubmitting(false) }
  }

  return (
    <AuthLayout
      eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle}
      footer={<>{c.have}{' '}<Link to="/login" className="text-accent font-semibold hover:underline">{c.signin}</Link></>}
    >
      {error && <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={c.name} type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
        <Field label={c.email} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field label={c.password} type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={c.pwph} />
        <SubmitButton type="submit" disabled={submitting}>{submitting ? c.submitting : c.submit}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-xs text-muted/70">{c.note}</p>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-surface-border" />
        <span className="text-xs text-muted">{c.or}</span>
        <div className="flex-1 h-px bg-surface-border" />
      </div>

      <GoogleButton label={c.google} />
    </AuthLayout>
  )
}
