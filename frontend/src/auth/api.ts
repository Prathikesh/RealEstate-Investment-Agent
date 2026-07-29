import axios from 'axios'
import { http } from '../api'

export interface User {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  name?: string
}

export async function fetchMe(): Promise<User> {
  const { data } = await http.get<User>('/auth/me')
  return data
}

export async function login(payload: LoginPayload): Promise<User> {
  const { data } = await http.post<User>('/auth/login', payload)
  return data
}

export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await http.post<User>('/auth/register', payload)
  return data
}

export async function logout(): Promise<void> {
  await http.post('/auth/logout')
}

/** Pulls the FastAPI `{ detail: "..." }` message out of a failed auth request, if present. */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
