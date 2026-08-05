import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'
import { useLang } from '../context/LanguageContext'
import AuthLayout, { Field, SubmitButton } from './AuthLayout'
import GoogleButton from './GoogleButton'

const COPY = {
  en: { eyebrow: 'Get started', title: 'Create your PlexAI account', subtitle: 'Registration is invite-only. Enter the code from your instructor to create your account.', name: 'Name', email: 'Email', password: 'Password', pwph: 'At least 8 characters', code: 'Invite code', codeph: 'e.g. PLX-XXXX-XXXX', submit: 'Create account', submitting: 'Creating account…', have: 'Already have an account?', signin: 'Sign in', note: 'Invite-only · Codes come from your instructor', pwErr: 'Password must be at least 8 characters', codeErr: 'Enter the invite code from your instructor', inviteRejected: 'That invite code is invalid or has already been used. Ask your instructor for a valid code.', err: 'Could not create your account', or: 'or', google: 'Sign up with Google' },
  fr: { eyebrow: 'Commencez', title: 'Créez votre compte PlexAI', subtitle: 'L’inscription est sur invitation. Entrez le code fourni par votre formateur pour créer votre compte.', name: 'Nom', email: 'Courriel', password: 'Mot de passe', pwph: 'Au moins 8 caractères', code: 'Code d’invitation', codeph: 'ex. PLX-XXXX-XXXX', submit: 'Créer un compte', submitting: 'Création du compte…', have: 'Vous avez déjà un compte ?', signin: 'Se connecter', note: 'Sur invitation · Les codes proviennent de votre formateur', pwErr: 'Le mot de passe doit contenir au moins 8 caractères', codeErr: 'Entrez le code d’invitation de votre formateur', inviteRejected: 'Ce code d’invitation est invalide ou a déjà été utilisé. Demandez un code valide à votre formateur.', err: 'Impossible de créer votre compte', or: 'ou', google: 'S’inscrire avec Google' },
}

export default function Register() {
  const { register } = useAuth()
  const { lang } = useLang()
  const c = COPY[lang] ?? COPY.en
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The Google-signup rejection redirects back here with ?error=invite.
  useEffect(() => {
    if (params.get('error') === 'invite') setError(c.inviteRejected)
  }, [params, c.inviteRejected])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!inviteCode.trim()) { setError(c.codeErr); return }
    if (password.length < 8) { setError(c.pwErr); return }
    setSubmitting(true)
    try {
      await register({ email, password, name: name || undefined, invite_code: inviteCode.trim() })
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
        <Field label={c.code} type="text" required autoComplete="off" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder={c.codeph} />
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

      <GoogleButton label={c.google} inviteCode={inviteCode.trim()} disabled={!inviteCode.trim()} />
    </AuthLayout>
  )
}
