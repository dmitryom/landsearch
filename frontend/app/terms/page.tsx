import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Пользовательское соглашение | LandSearch',
  description: 'Условия использования сервиса LandSearch и кадастровой карты.',
  alternates: { canonical: '/terms' },
  openGraph: {
    type: 'website', locale: 'ru_RU', siteName: 'LandSearch',
    title: 'Пользовательское соглашение | LandSearch',
    description: 'Условия использования сервиса LandSearch и кадастровой карты.', url: '/terms',
  },
  twitter: { card: 'summary', title: 'Пользовательское соглашение | LandSearch', description: 'Условия использования сервиса LandSearch и кадастровой карты.' },
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--ls-paper)] px-4 py-10 text-[var(--ls-ink)] sm:px-6">
      <article className="mx-auto max-w-3xl rounded-lg border border-[var(--ls-line)] bg-[var(--ls-surface)] p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-[var(--ls-blue)] hover:underline">На карту</Link>
        <h1 className="mt-6 text-2xl font-bold">Пользовательское соглашение</h1>
        <div className="mt-8 space-y-6 text-sm leading-6">
          <section><h2 className="text-lg font-semibold">1. Сервис</h2><p className="mt-2">LandSearch предоставляет интерфейс поиска земельных участков, просмотра картографических слоев и отправки обращений владельцу каталога.</p></section>
          <section><h2 className="text-lg font-semibold">2. Данные карты</h2><p className="mt-2">Кадастровые границы и атрибуты поступают из Национальной системы пространственных данных (НСПД). Они предназначены для предварительного анализа и не заменяют выписку из ЕГРН, межевание, юридическую проверку или консультацию кадастрового инженера. Источник, дата обновления и доступность отдельных картографических слоев могут меняться.</p></section>
          <section><h2 className="text-lg font-semibold">3. Заявки и учетные записи</h2><p className="mt-2">Пользователь предоставляет достоверные сведения, необходимые для связи и регистрации. Отправка заявки не создает договор купли-продажи, бронирования или обязательства о продаже участка, пока стороны отдельно не договорились об этом.</p></section>
          <section><h2 className="text-lg font-semibold">4. Ограничения</h2><p className="mt-2">Работа отдельных подложек и внешних слоев зависит от доступности соответствующих поставщиков. Владелец сервиса вправе обновлять слои, временно ограничивать доступ и исправлять ошибки данных.</p></section>
          <section><h2 className="text-lg font-semibold">5. Контакты и документы</h2><p className="mt-2">Сведения об операторе персональных данных доступны на странице <Link href="/operator" className="text-[var(--ls-blue)] underline">«Оператор»</Link>, а правила обработки данных — в <Link href="/privacy" className="text-[var(--ls-blue)] underline">политике обработки персональных данных</Link>.</p></section>
        </div>
      </article>
    </main>
  )
}
