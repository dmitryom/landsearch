'use client'

const MAX_LOGS = 50
const debugLogs = process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true'

export interface LogEntry {
  ts: string
  cat: 'map' | 'data' | 'webgl' | 'network' | 'render' | 'error'
  msg: string
  detail?: string
}

const _logs: LogEntry[] = []
let _subscribers: ((logs: LogEntry[]) => void)[] = []

function notify() {
  for (const fn of _subscribers) fn([..._logs])
}

export function log(cat: LogEntry['cat'], msg: string, detail?: string) {
  const ts = new Date().toLocaleTimeString('ru-RU', { hour12: false })
  _logs.push({ ts, cat, msg, detail })
  if (_logs.length > MAX_LOGS) _logs.shift()
  if (debugLogs) console.log(`[${cat.toUpperCase()}] ${msg}`, detail || '')
  else if (cat === 'error') console.error(`[${cat.toUpperCase()}] ${msg}`, detail || '')
  notify()
}

export function getLogs(): LogEntry[] { return [..._logs] }

export function subscribeLogs(fn: (logs: LogEntry[]) => void) {
  _subscribers.push(fn)
  return () => { _subscribers = _subscribers.filter((s) => s !== fn) }
}
