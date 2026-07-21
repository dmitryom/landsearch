import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const routes = ['/', '/privacy', '/terms', '/operator']
  return routes.map((path) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: path === '/' ? 'daily' : 'yearly',
    priority: path === '/' ? 1 : 0.3,
  }))
}
