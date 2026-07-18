'use client'

import { useEffect, useState } from 'react'
import { Box, Compass, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react'
import type maplibregl from 'maplibre-gl'

export const DEFAULT_3D_PITCH = 55

export function is3DView(pitch: number): boolean {
  return pitch > 10
}

export default function MapOrientationControls({
  map,
  hasSelectedPlot = false,
}: {
  map: maplibregl.Map
  hasSelectedPlot?: boolean
}) {
  const [bearing, setBearing] = useState(() => map.getBearing())
  const [is3D, setIs3D] = useState(() => is3DView(map.getPitch()))
  const [zoom, setZoom] = useState(() => map.getZoom())
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(false)

  useEffect(() => {
    const syncOrientation = () => {
      setBearing(map.getBearing())
      setIs3D(is3DView(map.getPitch()))
    }

    syncOrientation()
    map.on('rotate', syncOrientation)
    map.on('pitch', syncOrientation)

    return () => {
      map.off('rotate', syncOrientation)
      map.off('pitch', syncOrientation)
    }
  }, [map])

  useEffect(() => {
    const syncZoom = () => setZoom(map.getZoom())

    syncZoom()
    map.on('zoom', syncZoom)
    return () => {
      map.off('zoom', syncZoom)
    }
  }, [map])

  const locateUser = () => {
    if (!navigator.geolocation || locating) return

    setLocating(true)
    setLocationError(false)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: Math.max(map.getZoom(), 15),
          duration: 650,
        })
      },
      () => {
        setLocating(false)
        setLocationError(true)
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    )
  }

  return (
    <div
      aria-label="Управление картой"
      className={`absolute right-3 top-20 z-20 flex flex-col overflow-hidden rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] shadow-[0_2px_8px_rgba(23,34,29,0.12)] ${hasSelectedPlot ? 'ls-orientation-controls-selected' : ''}`}
      role="group"
    >
      <button
        type="button"
        onClick={() => map.easeTo({ bearing: 0, duration: 450 })}
        aria-label="Сбросить направление на север"
        title="Сбросить направление на север"
        className="grid min-h-11 min-w-11 place-items-center border-b border-[var(--ls-line)] text-[var(--ls-ink)] hover:bg-[#fbfdfb]"
      >
        <Compass
          aria-hidden="true"
          className="h-5 w-5 transition-transform duration-200"
          style={{ transform: `rotate(${-bearing}deg)` }}
        />
      </button>
      <button
        type="button"
        onClick={locateUser}
        aria-label={locationError ? 'Местоположение недоступно' : 'Моё местоположение'}
        title={locationError ? 'Местоположение недоступно' : 'Моё местоположение'}
        disabled={locating}
        className="grid min-h-11 min-w-11 place-items-center border-b border-[var(--ls-line)] text-[var(--ls-ink)] hover:bg-[#fbfdfb] disabled:cursor-wait disabled:opacity-60"
      >
        <LocateFixed aria-hidden="true" className={`h-5 w-5 ${locating ? 'animate-pulse' : ''}`} />
      </button>
      <button
        type="button"
        onClick={() => map.zoomIn({ duration: 300 })}
        aria-label="Увеличить масштаб"
        title="Увеличить масштаб"
        className="grid min-h-11 min-w-11 place-items-center border-b border-[var(--ls-line)] text-[var(--ls-ink)] hover:bg-[#fbfdfb]"
      >
        <ZoomIn aria-hidden="true" className="h-5 w-5" />
      </button>
      <output
        aria-label={`Текущий уровень масштаба ${zoom.toFixed(1)}`}
        title={`Уровень масштаба: ${zoom.toFixed(1)}`}
        className="flex h-7 min-w-11 items-center justify-center border-b border-[var(--ls-line)] bg-[#f7faf8] text-[10px] font-semibold tabular-nums text-[var(--ls-muted)]"
      >
        Z {zoom.toFixed(1)}
      </output>
      <button
        type="button"
        onClick={() => map.zoomOut({ duration: 300 })}
        aria-label="Уменьшить масштаб"
        title="Уменьшить масштаб"
        className="grid min-h-11 min-w-11 place-items-center border-b border-[var(--ls-line)] text-[var(--ls-ink)] hover:bg-[#fbfdfb]"
      >
        <ZoomOut aria-hidden="true" className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => map.easeTo({ pitch: is3DView(map.getPitch()) ? 0 : DEFAULT_3D_PITCH, bearing: map.getBearing(), duration: 600 })}
        aria-label={is3D ? 'Выключить 3D' : 'Включить 3D'}
        aria-pressed={is3D}
        title={is3D ? 'Выключить 3D' : 'Включить 3D'}
        className={`grid min-h-11 min-w-11 place-items-center text-[var(--ls-ink)] hover:bg-[#fbfdfb] ${is3D ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]' : ''}`}
      >
        <Box aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  )
}
