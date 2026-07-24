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
    const [lng, lat] = data.property_point?.coordinates ?? [0, 0]

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
