import type { Metadata } from 'next'
import AdminShell from './AdminShell'

export const metadata: Metadata = {
  title: 'Админка | LandSearch',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
