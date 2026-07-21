'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.auth.login(email, password)
      router.push('/admin')
    } catch (err: any) {
      setError(err.message || 'Ошибка входа')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">Вход в LandSearch</h1>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-1">Электронная почта</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm mb-1">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Войти
          </button>
        </form>
        <p className="text-center text-sm mt-4">
          Нет аккаунта? <a href="/auth/register" className="text-blue-600">Зарегистрироваться</a>
        </p>
        <p className="mt-3 text-center text-xs text-gray-500"><a href="/privacy" className="text-blue-700 underline">Политика обработки персональных данных</a><span className="mx-1">·</span><a href="/terms" className="text-blue-700 underline">Условия использования</a></p>
      </div>
    </div>
  )
}
