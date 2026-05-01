import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchNookBySlug } from '@/lib/nook-fetch'
import { NookHydrator } from '@/components/nook/NookHydrator'
import { NOOK_TYPE_LABELS } from '@/types/nook'

type Params = { id: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const nook = await fetchNookBySlug(id)
  if (!nook) {
    return { title: 'Nook not found' }
  }
  const title = `${nook.name} — Nook`
  const cityRegion = [nook.city, nook.region].filter(Boolean).join(', ')
  const typeLabel = NOOK_TYPE_LABELS[nook.type]
  const description = cityRegion
    ? `${typeLabel} in ${cityRegion}. Find a place to work from on Nook.`
    : `${typeLabel}. Find a place to work from on Nook.`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function NookDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  const nook = await fetchNookBySlug(id)
  if (!nook) notFound()

  return <NookHydrator nook={nook} />
}
