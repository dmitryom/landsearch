import type { Metadata } from 'next'

type SettlementMetadata = { name?: string; description?: string; address?: string }

async function getSettlement(id: string): Promise<SettlementMetadata | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1'
  try {
    const response = await fetch(`${baseUrl}/settlements/${encodeURIComponent(id)}?include_plots=false`, { next: { revalidate: 300 } })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const settlement = await getSettlement(id)
  const name = settlement?.name || 'Поселение'
  const title = `${name} — карта участков | LandSearch`
  const description = settlement?.description || `Карта земельных участков и кадастровых границ территории «${name}».`
  return {
    title,
    description,
    alternates: { canonical: `/settlements/${encodeURIComponent(id)}` },
    openGraph: { type: 'website', locale: 'ru_RU', siteName: 'LandSearch', title, description, url: `/settlements/${encodeURIComponent(id)}` },
    twitter: { card: 'summary', title, description },
  }
}

export default function SettlementLayout({ children }: { children: React.ReactNode }) {
  return children
}
