import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Авторизация | LandSearch',
    template: '%s | LandSearch',
  },
  description: 'Вход и регистрация в LandSearch.',
  robots: { index: false, follow: false, nocache: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
