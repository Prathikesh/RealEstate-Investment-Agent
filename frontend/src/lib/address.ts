// Some scraped listings fail address parsing and store full_address = "Unknown"
// (they're still real properties with a city, price and score). Show a clean
// fallback — neighbourhood/city, else MLS — instead of the raw "Unknown".

interface AddressLike {
  full_address?: string | null
  neighborhood?: string | null
  city?: string | null
  mls_number?: string | null
}

export function displayAddress(p: AddressLike): string {
  const addr = (p.full_address ?? '').trim()
  if (addr && addr.toLowerCase() !== 'unknown') return addr

  const place = [p.neighborhood, p.city].map(x => (x ?? '').trim()).filter(Boolean).join(', ')
  if (place) return place
  if (p.mls_number) return `MLS ${p.mls_number}`
  return 'Address unavailable'
}
