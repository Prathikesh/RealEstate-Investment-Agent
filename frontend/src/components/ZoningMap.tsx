import { useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchZoningBoundary } from '../api'

// ── 3D tilted map with the zone boundary in context ──────────────────────────
// MapLibre GL + OpenFreeMap (both free, no API key). Buildings extrude in 3D
// from the OpenMapTiles building layer; the zone polygon is drawn on top.
// This whole component (and MapLibre, ~210KB gzip) is code-split so it only
// loads when the Zoning tab renders — see React.lazy() in PropertyPage.

const ACCENT = '#7c3aed'

// Walk a GeoJSON Polygon/MultiPolygon and return its [[minLng,minLat],[maxLng,maxLat]]
// bounding box, so we can frame the zone even when the property has no geocoded point.
function geometryBounds(geom: any): [[number, number], [number, number]] | null {
  if (!geom?.coordinates) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (c: any) => {
    if (typeof c[0] === 'number') {
      const [x, y] = c
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else {
      c.forEach(visit)
    }
  }
  visit(geom.coordinates)
  return minX === Infinity ? null : [[minX, minY], [maxX, maxY]]
}

export default function ZoningMap({ propertyId }: { propertyId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['zoning-boundary', propertyId],
    queryFn: () => fetchZoningBoundary(propertyId),
    staleTime: 60 * 60 * 1000, // matches the backend's 1h Cache-Control
  })

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!data || !containerRef.current || mapRef.current) return
    const bounds = geometryBounds(data.zone_geometry)
    // Prefer the property's own point; otherwise fall back to the zone's centre so
    // the map never lands on null-island when a listing has no geocoded location.
    const point = data.property_point?.coordinates
    const [lng, lat] = point
      ?? (bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] : [-73.7, 45.6])

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [lng, lat],
      zoom: 16.2,
      pitch: 55,
      bearing: -18,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      // The map often mounts inside a freshly-shown tab before its container has
      // final dimensions, which leaves it stuck at world zoom. Resize to pick up
      // the real size, then explicitly frame the property/zone so we always land
      // on the right place at street level (keeping the 3D tilt).
      map.resize()
      if (point) {
        const pad = 0.0016 // ~150m box around the property → tight street-level view
        map.fitBounds([[point[0] - pad, point[1] - pad], [point[0] + pad, point[1] + pad]],
          { pitch: 55, bearing: -18, duration: 0 })
      } else if (bounds) {
        map.fitBounds(bounds, { padding: 50, pitch: 55, bearing: -18, maxZoom: 16.8, duration: 0 })
      }
      // find the vector source in the loaded style (openfreemap uses "openmaptiles")
      const style = map.getStyle()
      const vecSource = Object.keys(style.sources).find(id => (style.sources[id] as any).type === 'vector')

      // 3D building extrusions
      if (vecSource) {
        map.addLayer({
          id: 'zoning-3d-buildings',
          source: vecSource,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#cfd4da',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        })
      }

      // zone polygon (fill + crisp outline), drawn above buildings
      map.addSource('zone', { type: 'geojson', data: { type: 'Feature', geometry: data.zone_geometry as any, properties: {} } })
      map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': ACCENT, 'fill-opacity': 0.16 } })
      map.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': ACCENT, 'line-width': 3 } })

      // this property
      if (data.property_point) {
        const el = document.createElement('div')
        el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#DC2626;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)'
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      }
    })

    return () => { map.remove(); mapRef.current = null }
  }, [data])

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

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-surface-border h-full min-h-[420px]" />
}
