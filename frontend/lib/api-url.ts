export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '')

const ABSOLUTE_URL_RE = /^https?:\/\//i

export function absoluteApiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (ABSOLUTE_URL_RE.test(API_BASE)) {
    return `${API_BASE}${normalizedPath}`
  }
  if (typeof window === 'undefined') {
    return `${API_BASE}${normalizedPath}`
  }
  return `${window.location.origin}${API_BASE}${normalizedPath}`
}
