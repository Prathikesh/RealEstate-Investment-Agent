import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface CompareItem {
  id: string
  full_address: string
  asking_price: number | null
  city: string
  photos: string[]
  property_type: string
  score: number | null
  score_category: string | null
}

const MAX = 3
const KEY = 'qre_compare'

function load(): CompareItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function save(items: CompareItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

interface CompareCtx {
  items: CompareItem[]
  add: (item: CompareItem) => void
  remove: (id: string) => void
  toggle: (item: CompareItem) => void
  clear: () => void
  has: (id: string) => boolean
  isFull: boolean
}

const Ctx = createContext<CompareCtx | null>(null)

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>(load)

  const add = useCallback((item: CompareItem) => {
    setItems(prev => {
      if (prev.length >= MAX || prev.some(p => p.id === item.id)) return prev
      const next = [...prev, item]
      save(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.filter(p => p.id !== id)
      save(next)
      return next
    })
  }, [])

  const toggle = useCallback((item: CompareItem) => {
    setItems(prev => {
      const exists = prev.some(p => p.id === item.id)
      const next = exists
        ? prev.filter(p => p.id !== item.id)
        : prev.length < MAX ? [...prev, item] : prev
      save(next)
      return next
    })
  }, [])

  const clear = useCallback(() => { setItems([]); save([]) }, [])

  const has = useCallback((id: string) => items.some(p => p.id === id), [items])

  return (
    <Ctx.Provider value={{ items, add, remove, toggle, clear, has, isFull: items.length >= MAX }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCompare() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCompare must be used inside CompareProvider')
  return ctx
}
