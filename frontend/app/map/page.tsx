import type { Metadata } from 'next'
import MapShell from './MapShell'

export const metadata: Metadata = {
  title: 'Карта участков | LandSearch',
  description: 'Интерактивная карта земельных участков LandSearch.',
  robots: { index: false, follow: false, nocache: true },
}

export default function MapPage() {
  return <MapShell />
}
