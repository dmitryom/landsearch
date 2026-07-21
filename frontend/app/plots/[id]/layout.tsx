import type { Metadata } from 'next'

type PlotMetadata = {
  cadastral_number?: string
  address?: string
  area_m2?: number
  price?: number
  status?: string
}

async function getPlot(id: string): Promise<PlotMetadata | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1'
  try {
    const response = await fetch(`${baseUrl}/plots/${encodeURIComponent(id)}`, { next: { revalidate: 300 } })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const plot = await getPlot(id)
  const cadastralNumber = plot?.cadastral_number || id
  const address = plot?.address ? `, ${plot.address}` : ''
  const title = `Участок ${cadastralNumber} | LandSearch`
  const description = `Кадастровые сведения и расположение земельного участка ${cadastralNumber}${address}.`
  return {
    title,
    description,
    alternates: { canonical: `/plots/${encodeURIComponent(id)}` },
    openGraph: { type: 'website', locale: 'ru_RU', siteName: 'LandSearch', title, description, url: `/plots/${encodeURIComponent(id)}` },
    twitter: { card: 'summary', title, description },
  }
}

export default function PlotLayout({ children }: { children: React.ReactNode }) {
  return children
}
