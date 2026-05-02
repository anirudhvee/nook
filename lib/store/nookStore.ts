'use client'

import { create } from 'zustand'
import type { NookPlace } from '@/types/nook'

type NookStoreState = {
  selectedNook: NookPlace | null
  setSelectedNook: (nook: NookPlace | null) => void
  clearSelectedNook: () => void
}

export const useNookStore = create<NookStoreState>((set) => ({
  selectedNook: null,
  setSelectedNook: (nook) => set({ selectedNook: nook }),
  clearSelectedNook: () => set({ selectedNook: null }),
}))
