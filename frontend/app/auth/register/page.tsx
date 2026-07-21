'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.auth.register({ email, password, full_name: name, terms_accepted: termsAccepted })
      router.push('/admin')
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">Регистрация</h1>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="company-name" className="block text-sm mb-1">Название компании</label>
            <input
              id="company-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm mb-1">Электронная почта</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm mb-1">Пароль</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <label className="flex items-start gap-2 text-xs leading-5 text-gray-600">
            <input
              type="checkbox"
              required
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span>Я принимаю <a href="/terms" target="_blank" className="text-blue-700 underline">пользовательское соглашение</a> и <a href="/privacy" target="_blank" className="text-blue-700 underline">политику обработки персональных данных</a>.</span>
          </label>
          <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Зарегистрироваться
          </button>
        </form>
        <p className="text-center text-sm mt-4">
          Уже есть аккаунт? <a href="/auth/login" className="text-blue-600">Войти</a>
        </p>
        <p className="mt-3 text-center text-xs text-gray-500"><a href="/operator" className="text-blue-700 underline">Сведения об операторе</a></p>
      </div>
    </div>
  )
}
