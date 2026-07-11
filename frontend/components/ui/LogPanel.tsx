'use client'

import { useEffect, useState } from 'react'
import { subscribeLogs, type LogEntry } from '@/lib/logger'

const CAT_COLORS: Record<string, string> = {
  map: 'text-blue-600',
  data: 'text-green-600',
  webgl: 'text-purple-600',
  network: 'text-orange-600',
  render: 'text-teal-600',
  error: 'text-red-600',
}

export default function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(false)
  const debugLogs = process.env.NEXT_PUBLIC_DEBUG_LOGS === '1'

  useEffect(() => subscribeLogs(setLogs), [])

  if (!debugLogs) return null
  if (logs.length === 0 && !open) return null

  return (
    <div className="fixed bottom-0 right-0 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="m-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg hover:bg-gray-700 flex items-center gap-2"
      >
        <span className={`w-2 h-2 rounded-full ${logs.some(l => l.cat === 'error') ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
        Logs ({logs.length})
      </button>
      {open && (
        <div className="m-2 mt-0 bg-gray-900 text-gray-100 rounded-lg shadow-2xl max-h-[40vh] w-[500px] overflow-y-auto text-xs font-mono">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 sticky top-0 bg-gray-900">
            <span className="font-bold text-sm">Диагностика</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          {logs.map((l, i) => (
            <div key={i} className="px-3 py-1 border-b border-gray-800 hover:bg-gray-800">
              <span className="text-gray-500">{l.ts}</span>{' '}
              <span className={CAT_COLORS[l.cat] || 'text-gray-300'}>[{l.cat}]</span>{' '}
              <span>{l.msg}</span>
              {l.detail && <div className="text-gray-400 ml-8 mt-0.5 whitespace-pre-wrap break-all">{l.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
