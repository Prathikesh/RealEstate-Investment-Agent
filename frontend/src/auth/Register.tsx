import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppIcon } from '../components/QuartisLogo'
import { useAuth } from './AuthContext'
import { authErrorMessage } from './api'

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
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center shadow-md mb-3">
            <AppIcon size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-ink">Create your account</h1>
          <p className="text-sm text-muted mt-1">Start tracking Quebec investment properties</p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Name</label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="At least 8 characters"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
