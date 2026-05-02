'use client'

import { useEffect } from 'react'
import { useNookStore } from '@/lib/store/nookStore'
import type { NookPlace } from '@/types/nook'

export function NookHydrator({ nook }: { nook: NookPlace }) {
  useEffect(() => {
    useNookStore.getState().setSelectedNook(nook)
  }, [nook])

  return null
}
