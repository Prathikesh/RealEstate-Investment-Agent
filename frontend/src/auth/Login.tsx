import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'
import AuthLayout, { Field, SubmitButton } from './AuthLayout'

interface LocationState {
  from?: { pathname: string }
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, 'Invalid email or password'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Plexa"
      subtitle="Your Quebec deal pipeline is one click away."
      footer={
        <>Don&apos;t have an account?{' '}
          <Link to="/register" className="text-accent font-semibold hover:underline">Create one free</Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
        />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-semibold text-ink">Password</span>
            <span className="text-xs text-muted/70">Forgot?</span>
          </div>
          <input
            type="password" required autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-white text-sm text-ink
                       placeholder:text-muted/60 transition-shadow
                       focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
        </div>
        <SubmitButton type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
