'use client'

import { useEffect } from 'react'
import { useNookStore } from '@/lib/store/nookStore'

export function NookClearer() {
  useEffect(() => {
    useNookStore.getState().clearSelectedNook()
  }, [])
  return null
}
