import { http } from '../api'

export async function logPageView(path: string): Promise<void> {
  // Fire-and-forget: a logged-out visitor or a dropped request should never
  // block navigation, so failures are swallowed rather than surfaced.
  try {
    await http.post('/analytics/pageview', { path })
  } catch {
    // ignored
  }
}
