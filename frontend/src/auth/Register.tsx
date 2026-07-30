import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'
import AuthLayout, { Field, SubmitButton } from './AuthLayout'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)
    try {
      await register({ email, password, name: name || undefined })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, 'Could not create your account'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started — free"
      title="Create your Plexa account"
      subtitle="Find undervalued Quebec properties — scored, analyzed and alerted for you, in minutes."
      footer={
        <>Already have an account?{' '}
          <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link>
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
          label="Name" type="text" autoComplete="name"
          value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe"
        />
        <Field
          label="Email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
        />
        <Field
          label="Password" type="password" required autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
        />
        <SubmitButton type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create free account'}
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-xs text-muted/70">
        No credit card required · Cancel anytime
      </p>
    </AuthLayout>
  )
}
