'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

export type SnapPoint = 'peek' | 'half' | 'full'

export const HEADER_H = 100
export const HALF_VISIBLE_RATIO = 0.55
const PEEK_H   = 80

export function getMobileHalfVisibleHeight(viewportHeight: number): number {
  return viewportHeight * HALF_VISIBLE_RATIO
}

const SNAP_ORDER: SnapPoint[] = ['peek', 'half', 'full']
const FLING_THRESHOLD = 0.5

const SNAP_TRANSLATE: Record<SnapPoint, string> = {
  peek: `calc(100dvh - ${HEADER_H}px - ${PEEK_H}px)`,
  half: `calc(${(1 - HALF_VISIBLE_RATIO) * 100}dvh - ${HEADER_H}px)`,
  full: '0px',
}

function computeSnapPx(snap: SnapPoint): number {
  const sheetH = window.innerHeight - HEADER_H
  switch (snap) {
    case 'peek': return sheetH - PEEK_H
    case 'half': return sheetH - getMobileHalfVisibleHeight(window.innerHeight)
    case 'full': return 0
  }
}

function nearestSnap(px: number): SnapPoint {
  return SNAP_ORDER.reduce<SnapPoint>((best, s) => {
    const bDist = Math.abs(computeSnapPx(best) - px)
    const sDist = Math.abs(computeSnapPx(s) - px)
    return sDist < bDist ? s : best
  }, 'half')
}

interface Props {
  snapPoint: SnapPoint
  onSnapChange: (snap: SnapPoint) => void
  children: React.ReactNode
}

export function MobileBottomSheet({ snapPoint, onSnapChange, children }: Props) {
  const [dragPx, setDragPx] = useState<number | null>(null)

  const isDragging        = useRef(false)
  const touchStartY       = useRef(0)
  const touchStartSnapPx  = useRef(0)
  const lastTouchY        = useRef(0)
  const lastTouchTime     = useRef(0)
  const velocityRef       = useRef(0)
  const dragPxRef         = useRef<number | null>(null)
  const snapPointRef      = useRef<SnapPoint>(snapPoint)
  const hasDraggedRef     = useRef(false)
  const contentRef        = useRef<HTMLDivElement>(null)
  const onSnapChangeRef   = useRef(onSnapChange)

  snapPointRef.current  = snapPoint
  onSnapChangeRef.current = onSnapChange

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current      = true
    hasDraggedRef.current   = false
    const y                 = e.touches[0].clientY
    touchStartY.current     = y
    touchStartSnapPx.current = computeSnapPx(snapPointRef.current)
    lastTouchY.current      = y
    lastTouchTime.current   = Date.now()
    velocityRef.current     = 0
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    const now      = Date.now()
    const currentY = e.touches[0].clientY
    const dt       = now - lastTouchTime.current

    if (dt > 0) {
      velocityRef.current = (currentY - lastTouchY.current) / dt
    }
    lastTouchY.current  = currentY
    lastTouchTime.current = now

    const delta  = currentY - touchStartY.current
    const sheetH = window.innerHeight - HEADER_H
    const newPx  = Math.max(0, Math.min(touchStartSnapPx.current + delta, sheetH - PEEK_H))

    if (Math.abs(delta) > 4) hasDraggedRef.current = true

    dragPxRef.current = newPx
    setDragPx(newPx)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false

    if (!hasDraggedRef.current && snapPointRef.current === 'peek') {
      setDragPx(null)
      dragPxRef.current = null
      onSnapChange('half')
      return
    }

    const currentIdx = SNAP_ORDER.indexOf(snapPointRef.current)
    let next: SnapPoint

    if (velocityRef.current > FLING_THRESHOLD) {
      next = SNAP_ORDER[Math.max(0, currentIdx - 1)]
    } else if (velocityRef.current < -FLING_THRESHOLD) {
      next = SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, currentIdx + 1)]
    } else {
      next = nearestSnap(dragPxRef.current ?? computeSnapPx(snapPointRef.current))
    }

    dragPxRef.current = null
    setDragPx(null)
    onSnapChange(next)
  }, [onSnapChange])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    let contentTouchStartY = 0

    function getScrollTop(target: EventTarget | null): number {
      let node = target as HTMLElement | null
      while (node && node !== el) {
        if (node.scrollTop > 0) return node.scrollTop
        node = node.parentElement
      }
      return el?.scrollTop ?? 0
    }

    function handleTouchStart(e: TouchEvent) {
      contentTouchStartY = e.touches[0].clientY
    }

    function handleTouchMove(e: TouchEvent) {
      const deltaY = e.touches[0].clientY - contentTouchStartY
      const snap   = snapPointRef.current

      if (snap === 'half' && deltaY < -10) {
        onSnapChangeRef.current('full')
        e.preventDefault()
      } else if (snap === 'full' && getScrollTop(e.target) <= 0 && deltaY > 30) {
        onSnapChangeRef.current('half')
        e.preventDefault()
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  const translateY = dragPx !== null ? `${dragPx}px` : SNAP_TRANSLATE[snapPoint]
  const animate    = dragPx === null

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-20',
        'flex flex-col rounded-t-2xl',
        'bg-background/95 backdrop-blur-sm',
        'border-t border-x border-border',
        'shadow-[0_-4px_24px_rgba(0,0,0,0.07)]',
        animate && 'transition-transform duration-300 ease-out',
      )}
      style={{
        height: `calc(100dvh - ${HEADER_H}px)`,
        transform: `translateY(${translateY})`,
        willChange: 'transform',
      }}
    >
      <div
        className="shrink-0 flex flex-col items-center pt-2 pb-1 touch-none select-none cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1 rounded-full bg-border/70" />
      </div>

      <div ref={contentRef} className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  )
}
