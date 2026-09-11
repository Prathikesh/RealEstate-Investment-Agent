import 'leaflet/dist/leaflet.css'
import { displayAddress } from '../lib/address'
import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import type { MapProperty } from '../api'

const CATEGORY_COLOR: Record<string, string> = {
  strong_opportunity:  '#059669',
  worth_investigating: '#2563EB',
  market_price:        '#D97706',
  not_recommended:     '#DC2626',
}

const CATEGORY_LABEL: Record<string, string> = {
  strong_opportunity:  'Strong Buy',
  worth_investigating: 'Worth Checking',
  market_price:        'Fair Price',
  not_recommended:     'Skip It',
}

const LEGEND = [
  { color: '#059669', label: 'Strong buy (80+)',       key: 'strong_opportunity' },
  { color: '#2563EB', label: 'Worth checking (60–79)', key: 'worth_investigating' },
  { color: '#D97706', label: 'Fair price (40–59)',     key: 'market_price' },
  { color: '#DC2626', label: 'Not recommended (<40)',  key: 'not_recommended' },
  { color: '#94A3B8', label: 'Not yet scored',         key: '' },
]

function markerColor(p: MapProperty): string {
  if (p.score_category && CATEGORY_COLOR[p.score_category]) return CATEGORY_COLOR[p.score_category]
  if (p.score == null) return '#94A3B8'
  if (p.score >= 80) return '#059669'
  if (p.score >= 60) return '#2563EB'
  if (p.score >= 40) return '#D97706'
  return '#DC2626'
}

function markerRadius(p: MapProperty): number {
  if (p.score == null) return 7
  if (p.score >= 80) return 12
  if (p.score >= 60) return 10
  if (p.score >= 40) return 8
  return 7
}

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

interface Props {
  properties: MapProperty[]
  isLoading?: boolean
}

export default function PropertyMapView({ properties, isLoading }: Props) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filtered = activeFilter
    ? properties.filter(p => p.score_category === activeFilter)
    : properties

  const counts = {
    strong_opportunity:  properties.filter(p => p.score_category === 'strong_opportunity').length,
    worth_investigating: properties.filter(p => p.score_category === 'worth_investigating').length,
    market_price:        properties.filter(p => p.score_category === 'market_price').length,
    not_recommended:     properties.filter(p => p.score_category === 'not_recommended').length,
  }

  if (isLoading) {
    return (
      <div className="shimmer rounded-2xl border border-surface-border overflow-hidden" style={{ height: 640 }}>
        <div className="h-full w-full flex flex-col items-center justify-center gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="rgba(148,163,184,0.5)" />
          </svg>
          <p className="text-sm text-muted font-medium">Loading map…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-surface-border" style={{ height: 640, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      <MapContainer
        center={[45.55, -73.65]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        zoomControl
      >
        {/* CartoDB Voyager — clear roads, labels, neutral but crisp */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {filtered.map(p => {
          const color = markerColor(p)
          const radius = markerRadius(p)
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={radius}
              pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.92 }}
              eventHandlers={{
                mouseover: (e) => {
                  e.target.setRadius(radius + 4)
                  e.target.setStyle({ weight: 3, fillOpacity: 1 })
                },
                mouseout: (e) => {
                  e.target.setRadius(radius)
                  e.target.setStyle({ weight: 2, fillOpacity: 0.92 })
                },
              }}
            >
              <Popup maxWidth={250} className="qre-popup">
                <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>

                  {/* Photo — bleeds to popup edges */}
                  {p.photo && (
                    <div style={{ margin: '-14px -16px 12px', overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
                      <img
                        src={p.photo}
                        alt={displayAddress(p)}
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                        onError={e => {
                          const el = e.currentTarget as HTMLImageElement
                          if (el.parentElement) el.parentElement.style.display = 'none'
                        }}
                      />
                    </div>
                  )}

                  {/* Category badge + property category (Commercial/Land use a
                      comparable-price-positioning score, not the residential
                      cap-rate/cash-flow model — same 4-tier categories, different
                      underlying signal, so the color coding still applies) */}
                  {(p.score_category || p.property_type === 'commercial' || p.property_type === 'land') && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.score_category && (
                        <span style={{
                          display: 'inline-block',
                          background: color,
                          color: '#fff',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}>
                          {CATEGORY_LABEL[p.score_category] ?? p.score_category}
                        </span>
                      )}
                      {(p.property_type === 'commercial' || p.property_type === 'land') && (
                        <span style={{
                          display: 'inline-block',
                          background: '#334155',
                          color: '#fff',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}>
                          {p.property_type === 'commercial' ? 'Commercial' : 'Land'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Price + score */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 900, fontSize: 20, color: '#0F172A', lineHeight: 1.1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCAD(p.asking_price)}
                    </span>
                    {p.score != null && (
                      <div style={{
                        background: color + '18',
                        border: `1.5px solid ${color}50`,
                        color,
                        borderRadius: 8,
                        padding: '3px 9px',
                        fontSize: 12,
                        fontWeight: 800,
                        lineHeight: 1.4,
                        flexShrink: 0,
                      }}>
                        {p.score}/100
                      </div>
                    )}
                  </div>

                  {/* Address */}
                  <p style={{ fontSize: 12, color: '#1E293B', fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>
                    {displayAddress(p)}
                  </p>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>{p.city}</p>

                  {/* Divider */}
                  <div style={{ height: 1, background: '#F1F5F9', margin: '8px 0 12px' }} />

                  {/* View details CTA */}
                  <a
                    href={`/properties/${p.id}`}
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '9px 0',
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      letterSpacing: '0.02em',
                      boxShadow: '0 2px 8px rgba(37,99,235,0.30)',
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

      {/* ── Category filter chips (floating, top-left) ── */}
      <div style={{
        position: 'absolute', top: 12, left: 54, zIndex: 1000,
        display: 'flex', gap: 6, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setActiveFilter(null)}
          style={{
            padding: '5px 13px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            border: '1.5px solid',
            cursor: 'pointer',
            background: activeFilter === null ? '#2563EB' : 'rgba(255,255,255,0.97)',
            color: activeFilter === null ? '#fff' : '#64748B',
            borderColor: activeFilter === null ? '#2563EB' : '#E2E8F0',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
            transition: 'all 0.15s',
          }}
        >
          All ({properties.length})
        </button>
        {(Object.entries(counts) as [string, number][])
          .filter(([, c]) => c > 0)
          .map(([key, count]) => (
            <button
              key={key}
              onClick={() => setActiveFilter(activeFilter === key ? null : key)}
              style={{
                padding: '5px 13px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                border: `1.5px solid`,
                cursor: 'pointer',
                background: activeFilter === key ? CATEGORY_COLOR[key] : 'rgba(255,255,255,0.97)',
                color: activeFilter === key ? '#fff' : CATEGORY_COLOR[key],
                borderColor: activeFilter === key ? CATEGORY_COLOR[key] : CATEGORY_COLOR[key] + '55',
                backdropFilter: 'blur(6px)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: activeFilter === key ? '#fff' : CATEGORY_COLOR[key],
                display: 'inline-block',
              }} />
              {CATEGORY_LABEL[key]} ({count})
            </button>
          ))}
      </div>

      {/* ── Property counter (top-right) ── */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 1000,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(8px)',
        borderRadius: 10,
        padding: '5px 13px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 2px 12px rgba(0,0,0,0.09)',
        fontSize: 12, fontWeight: 700, color: '#0F172A',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeFilter ? CATEGORY_COLOR[activeFilter] : '#2563EB', display: 'inline-block' }} />
        {filtered.length.toLocaleString()} {activeFilter ? CATEGORY_LABEL[activeFilter] : 'properties'} on map
      </div>

      {/* ── Score legend (bottom-right) ── */}
      <div style={{
        position: 'absolute', bottom: 32, right: 12, zIndex: 1000,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(8px)',
        borderRadius: 14,
        padding: '12px 16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
        minWidth: 190,
      }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Score Legend
        </p>
        {LEGEND.map(l => (
          <div
            key={l.label}
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, cursor: l.key ? 'pointer' : 'default' }}
            onClick={() => l.key && setActiveFilter(activeFilter === l.key ? null : l.key)}
          >
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: l.color,
              border: '2px solid #fff',
              boxShadow: `0 0 0 1.5px ${l.color}70`,
              flexShrink: 0,
              outline: l.key && activeFilter === l.key ? `2px solid ${l.color}` : 'none',
              outlineOffset: 2,
            }} />
            <span style={{
              fontSize: 11,
              color: l.key && activeFilter === l.key ? l.color : '#374151',
              fontWeight: l.key && activeFilter === l.key ? 700 : 500,
            }}>
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
