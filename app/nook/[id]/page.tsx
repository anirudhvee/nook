import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function NookDetailPage({ params }: Props) {
  const { id } = await params
  redirect(`/?nook=${encodeURIComponent(id)}`)
}
