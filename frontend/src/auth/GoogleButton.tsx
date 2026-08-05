import { API_BASE } from '../api'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  )
}

/** Full browser navigation, not an axios call — the browser has to actually
 * visit Google and come back through the server-side OAuth redirect flow.
 * `inviteCode` (register only) is forwarded so first-time Google signups are
 * gated the same way as email/password. `disabled` blocks the flow until a
 * code is entered. */
export default function GoogleButton({ label, inviteCode, disabled }: { label: string; inviteCode?: string; disabled?: boolean }) {
  const start = () => {
    const q = inviteCode ? `?invite_code=${encodeURIComponent(inviteCode)}` : ''
    window.location.href = `${API_BASE}/auth/google/login${q}`
  }
  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-surface-border text-sm font-semibold text-ink hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <GoogleIcon />
      {label}
    </button>
  )
}
