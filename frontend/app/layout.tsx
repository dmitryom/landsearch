import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LandSearch — Поиск земельных участков',
  description: 'Сервис поиска и продажи земельных участков с интеграцией Росреестра',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
