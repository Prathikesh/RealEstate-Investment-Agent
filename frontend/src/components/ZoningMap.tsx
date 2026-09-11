import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { fetchZoningBoundary } from '../api'

// ── Zoning map ───────────────────────────────────────────────────────────────
// Leaflet + CartoDB raster tiles — the same proven, reliable basemap the
// Properties map uses. (We tried MapLibre + OpenFreeMap for a 3D view, but the
// free OpenFreeMap tile service rendered blank in production — not something to
// depend on for a live product.) Here we draw the property's zone boundary and
// pin the property itself. Code-split via React.lazy so Leaflet only loads when
// the Zoning tab opens.

const ACCENT = '#7c3aed'

// Frames the map on the zone (plus the property point) once both are on the map,
// and fixes Leaflet's stale size when it mounts inside a freshly-shown tab.
function FitToZone({ geometry, point }: { geometry: any; point?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    try {
      const bounds = L.geoJSON(geometry).getBounds()
      if (point) bounds.extend([point[1], point[0]]) // point is [lng,lat] → Leaflet [lat,lng]
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 })
    } catch {
      /* leave the map at its initial view if the geometry can't be parsed */
    }
  }, [geometry, point, map])
  return null
}

export default function ZoningMap({ propertyId }: { propertyId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['zoning-boundary', propertyId],
    queryFn: () => fetchZoningBoundary(propertyId),
    staleTime: 60 * 60 * 1000, // matches the backend's 1h Cache-Control
  })

  if (isLoading) {
    return <div className="shimmer rounded-xl border border-surface-border h-full min-h-[420px]" />
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface flex items-center justify-center text-sm text-muted h-full min-h-[420px]">
        Map unavailable for this property
      </div>
    )
  }

  const point = data.property_point?.coordinates as [number, number] | undefined // [lng, lat]
  const center: [number, number] = point ? [point[1], point[0]] : [45.55, -73.65]

  return (
    <div className="rounded-xl overflow-hidden border border-surface-border h-full min-h-[420px]">
      <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        {/* CartoDB Voyager — clear roads and labels, same reliable tiles as the Properties map */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains="abc"
          maxZoom={19}
        />
        <GeoJSON
          key={data.zone_code}
          data={data.zone_geometry as any}
          style={{ color: ACCENT, weight: 3, fillColor: ACCENT, fillOpacity: 0.14 }}
        />
        {point && (
          <CircleMarker
            center={[point[1], point[0]]}
            radius={9}
            pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#DC2626', fillOpacity: 1 }}
          />
        )}
        <FitToZone geometry={data.zone_geometry} point={point} />
      </MapContainer>
    </div>
  )
}
