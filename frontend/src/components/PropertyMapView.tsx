import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import type { MapProperty } from '../api'

const CATEGORY_COLOR: Record<string, string> = {
  strong_opportunity: '#059669',
  worth_investigating: '#2563EB',
  market_price: '#D97706',
  not_recommended: '#DC2626',
}

function markerColor(p: MapProperty): string {
  if (p.score_category && CATEGORY_COLOR[p.score_category]) return CATEGORY_COLOR[p.score_category]
  if (p.score == null) return '#94A3B8'
  if (p.score >= 80) return '#059669'
  if (p.score >= 60) return '#2563EB'
  if (p.score >= 40) return '#D97706'
  return '#DC2626'
}

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

const LEGEND = [
  { color: '#059669', label: 'Strong buy (80+)' },
  { color: '#2563EB', label: 'Worth checking (60–79)' },
  { color: '#D97706', label: 'Fair price (40–59)' },
  { color: '#DC2626', label: 'Not recommended (<40)' },
  { color: '#94A3B8', label: 'Not yet scored' },
]

interface Props {
  properties: MapProperty[]
  isLoading?: boolean
}

export default function PropertyMapView({ properties, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface-card animate-pulse" style={{ height: 600 }}>
        <div className="h-full w-full bg-surface-hover rounded-2xl flex items-center justify-center">
          <p className="text-muted text-sm">Loading map…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-surface-border shadow-card" style={{ height: 600 }}>
      <MapContainer
        center={[45.55, -73.65]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {properties.map(p => {
          const color = markerColor(p)
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={9}
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.9 }}
            >
              <Popup maxWidth={220} className="qre-popup">
                <div style={{ fontFamily: 'inherit', minWidth: 180 }}>
                  {p.photo && (
                    <img
                      src={p.photo}
                      alt={p.full_address}
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', lineHeight: 1.3, marginBottom: 2 }}>
                    {p.full_address}
                  </p>
                  <p style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>{p.city}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{fmtCAD(p.asking_price)}</span>
                    {p.score != null && (
                      <span style={{
                        background: color, color: '#fff',
                        borderRadius: 999, padding: '2px 8px',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {p.score}/100
                      </span>
                    )}
                  </div>
                  <a
                    href={`/properties/${p.id}`}
                    style={{
                      display: 'block', textAlign: 'center', background: '#2563EB',
                      color: '#fff', borderRadius: 8, padding: '6px 0',
                      fontSize: 12, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    View Details →
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 24, right: 12, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
        borderRadius: 12, padding: '10px 14px',
        border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Score legend
        </p>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, border: '1.5px solid #fff', boxShadow: '0 0 0 1px ' + l.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#374151' }}>{l.label}</span>
          </div>
        ))}
        <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, borderTop: '1px solid #E2E8F0', paddingTop: 6 }}>
          {/* count shown below */}
        </p>
      </div>

      {/* Counter */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 1000,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
        borderRadius: 8, padding: '4px 10px',
        border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        fontSize: 12, fontWeight: 600, color: '#374151',
      }}>
        {properties.length} properties on map
      </div>
    </div>
  )
}
