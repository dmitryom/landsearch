'use client'

export function MapSkeleton() {
  return (
    <div className="animate-pulse flex flex-col h-screen">
      <div className="h-14 bg-gray-200 border-b" />
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Загрузка карты...</p>
        </div>
      </div>
    </div>
  )
}

export function PlotCardSkeleton() {
  return (
    <div className="w-56 sm:w-64 shrink-0 bg-white rounded-xl border animate-pulse">
      <div className="p-3 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-5 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg" />
      ))}
    </div>
  )
}
