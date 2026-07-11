'use client'

import { FormEvent, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '@/lib/api'

interface LeadFormProps {
  plotId: string
  title?: string
  compact?: boolean
}

export default function LeadForm({ plotId, title = 'Заявка на консультацию', compact = false }: LeadFormProps) {
  const [form, setForm] = useState({
    buyer_name: '',
    buyer_phone: '',
    buyer_email: '',
    message: '',
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (error) setError('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.buyer_phone.trim() && !form.buyer_email.trim()) {
      setError('Укажите телефон или email для связи')
      return
    }

    setSending(true)
    setError('')
    try {
      await api.leads.create({
        plot_id: plotId,
        buyer_name: form.buyer_name.trim() || undefined,
        buyer_phone: form.buyer_phone.trim() || undefined,
        buyer_email: form.buyer_email.trim() || undefined,
        message: form.message.trim() || undefined,
      })
      setSent(true)
      setForm({ buyer_name: '', buyer_phone: '', buyer_email: '', message: '' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить заявку')
    }
    setSending(false)
  }

  if (sent) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Заявка отправлена. Менеджер свяжется с вами.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-2' : 'space-y-3'}>
      <h2 className={compact ? 'text-sm font-semibold text-gray-900' : 'text-lg font-semibold text-gray-900'}>
        {title}
      </h2>

      <div>
        <label htmlFor="lead-name" className="block text-xs font-medium text-gray-600 mb-1">
          Имя
        </label>
        <input
          id="lead-name"
          value={form.buyer_name}
          onChange={(e) => updateField('buyer_name', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="Как к вам обращаться"
          maxLength={255}
        />
      </div>

      <div>
        <label htmlFor="lead-phone" className="block text-xs font-medium text-gray-600 mb-1">
          Телефон
        </label>
        <input
          id="lead-phone"
          type="tel"
          value={form.buyer_phone}
          onChange={(e) => updateField('buyer_phone', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="+7"
          maxLength={50}
        />
      </div>

      <div>
        <label htmlFor="lead-email" className="block text-xs font-medium text-gray-600 mb-1">
          Email
        </label>
        <input
          id="lead-email"
          type="email"
          value={form.buyer_email}
          onChange={(e) => updateField('buyer_email', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="mail@example.ru"
        />
      </div>

      <div>
        <label htmlFor="lead-message" className="block text-xs font-medium text-gray-600 mb-1">
          Комментарий
        </label>
        <textarea
          id="lead-message"
          value={form.message}
          onChange={(e) => updateField('message', e.target.value)}
          className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="Интересует цена, условия покупки или просмотр участка"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
        {sending ? 'Отправка...' : 'Отправить заявку'}
      </button>
    </form>
  )
}
