import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LandSearch — Поиск земельных участков',
  description: 'Сервис поиска и продажи земельных участков с интеграцией Росреестра',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'LandSearch',
    title: 'LandSearch — Поиск земельных участков',
    description: 'Поиск земельных участков по карте, адресу и кадастровому номеру.',
  },
  twitter: {
    card: 'summary',
    title: 'LandSearch — Поиск земельных участков',
    description: 'Поиск земельных участков по карте, адресу и кадастровому номеру.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'LandSearch',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru-RU',
    description: 'Поиск и анализ земельных участков по карте, адресу и кадастровому номеру.',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  }

  return (
    <html lang="ru">
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </body>
    </html>
  )
}
