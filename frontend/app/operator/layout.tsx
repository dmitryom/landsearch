import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Оператор персональных данных | LandSearch',
  description: 'Реквизиты оператора, контакты для обращений субъектов данных и сведения о реестре Роскомнадзора.',
  alternates: { canonical: '/operator' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'LandSearch',
    title: 'Оператор персональных данных | LandSearch',
    description: 'Реквизиты оператора и контакты для обращений субъектов данных.',
    url: '/operator',
  },
  twitter: {
    card: 'summary',
    title: 'Оператор персональных данных | LandSearch',
    description: 'Реквизиты оператора и контакты для обращений субъектов данных.',
  },
}

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return children
}
