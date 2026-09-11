import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ExternalLink } from 'lucide-react'
import { fetchFloodBoundary } from '../api'

// ── Flood zone map ──────────────────────────────────────────────────────────
// Same Leaflet + CartoDB setup as ZoningMap.tsx, styled in red instead of the
// zoning purple so the two read as distinct signals (upside vs. risk) when both
// appear on the same property page. The government grid can match more than one
// small cell around a property, so the boundary endpoint returns a
// GeometryCollection rather than a single polygon.

const FLOOD_COLOR = '#DC2626'

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

export default function FloodZoneMap({ propertyId }: { propertyId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['flood-boundary', propertyId],
    queryFn: () => fetchFloodBoundary(propertyId),
    staleTime: 60 * 60 * 1000, // matches the backend's 1h Cache-Control
  })

  if (isLoading) {
    return <div className="shimmer rounded-xl border border-surface-border h-full min-h-[420px]" />
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface flex items-center justify-center text-sm text-muted h-full min-h-[420px]">
        Flood zone map unavailable for this property
      </div>
    )
  }

  const point = data.property_point?.coordinates as [number, number] | undefined // [lng, lat]
  const center: [number, number] = point ? [point[1], point[0]] : [45.55, -73.65]

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="rounded-xl overflow-hidden border border-surface-border flex-1 min-h-[380px]">
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            subdomains="abc"
            maxZoom={19}
          />
          <GeoJSON
            key={propertyId}
            data={data.zone_geometry as any}
            style={{ color: FLOOD_COLOR, weight: 2, fillColor: FLOOD_COLOR, fillOpacity: 0.22 }}
          />
          {point && (
            <CircleMarker
              center={[point[1], point[0]]}
              radius={9}
              pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#1E3A8A', fillOpacity: 1 }}
            />
          )}
          <FitToZone geometry={data.zone_geometry} point={point} />
        </MapContainer>
      </div>
      {point && (
        <a
          href={`https://www.google.com/maps?q=${point[1]},${point[0]}&z=17`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-accent hover:underline py-1"
        >
          <ExternalLink size={12} />
          Open this exact location on the map
        </a>
      )}
    </div>
  )
}
