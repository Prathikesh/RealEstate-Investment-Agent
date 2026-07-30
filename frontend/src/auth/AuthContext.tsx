import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type LoginPayload,
  type RegisterPayload,
  type User,
} from './api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (data: LoginPayload) => Promise<void>
  register: (data: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(data: LoginPayload) {
    setUser(await loginRequest(data))
  }

  async function register(data: RegisterPayload) {
    setUser(await registerRequest(data))
  }

  async function logout() {
    await logoutRequest()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
