import type { Plot } from './api'

export type PlotBounds = [[number, number], [number, number]]

type Coordinate = [number, number]

function extendBounds(bounds: PlotBounds | null, coordinate: Coordinate): PlotBounds {
  if (!bounds) return [coordinate, coordinate]

  const [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] = bounds
  const [longitude, latitude] = coordinate
  return [
    [Math.min(minLongitude, longitude), Math.min(minLatitude, latitude)],
    [Math.max(maxLongitude, longitude), Math.max(maxLatitude, latitude)],
  ]
}

function collectBounds(value: unknown, bounds: PlotBounds | null): PlotBounds | null {
  if (!Array.isArray(value)) return bounds

  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    return extendBounds(bounds, [value[0] as number, value[1] as number])
  }

  return value.reduce<PlotBounds | null>((nextBounds, child) => collectBounds(child, nextBounds), bounds)
}

export function getGeometryBounds(geometry: Record<string, unknown> | undefined): PlotBounds | null {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null
  return collectBounds(geometry.coordinates, null)
}

export function getPlotBounds(plots: Plot[]): PlotBounds | null {
  let bounds: PlotBounds | null = null

  for (const plot of plots) {
    const geometryBounds = getGeometryBounds(plot.geometry)
    if (geometryBounds) {
      bounds = extendBounds(bounds, geometryBounds[0])
      bounds = extendBounds(bounds, geometryBounds[1])
    } else if (Number.isFinite(plot.center_lng) && Number.isFinite(plot.center_lat)) {
      bounds = extendBounds(bounds, [plot.center_lng as number, plot.center_lat as number])
    }
  }

  return bounds
}
