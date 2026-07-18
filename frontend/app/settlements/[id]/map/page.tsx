import { redirect } from 'next/navigation'

export default async function SettlementMapRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/settlements/${id}`)
}
