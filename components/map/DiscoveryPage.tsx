import { headers } from 'next/headers'
import { Suspense } from 'react'
import { DiscoveryMapLoader } from '@/components/map/DiscoveryMapLoader'

const SF_FALLBACK: [number, number] = [-122.4194, 37.7749]

export async function DiscoveryPage() {
  const h = await headers()
  const lat = parseFloat(h.get('x-vercel-ip-latitude') ?? '')
  const lng = parseFloat(h.get('x-vercel-ip-longitude') ?? '')
  const initialCenter: [number, number] =
    Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : SF_FALLBACK

  return (
    <Suspense fallback={<div className="h-screen w-screen bg-muted" />}>
      <DiscoveryMapLoader initialCenter={initialCenter} />
    </Suspense>
  )
}
