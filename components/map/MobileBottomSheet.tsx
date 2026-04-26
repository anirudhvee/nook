'use client'

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import { cn } from '@/lib/utils'

export type SnapPoint = 'peek' | 'half' | 'full'

export const HEADER_H = 100
export const HALF_VISIBLE_RATIO = 0.45
export const PEEK_H = 104

export function getMobileHalfVisibleHeight(viewportHeight: number): number {
  return viewportHeight * HALF_VISIBLE_RATIO
}

const SNAP_ORDER: SnapPoint[] = ['peek', 'half', 'full']
const FLING_THRESHOLD = 0.5

function readViewportHeight(): number | null {
  if (typeof window === 'undefined') return null
  return Math.round(window.visualViewport?.height ?? window.innerHeight)
}

function getSheetHeight(viewportHeight: number, headerH: number): number {
  return Math.max(viewportHeight - headerH, 0)
}

function computeSnapPx(snap: SnapPoint, viewportHeight: number, headerH: number): number {
  const sheetH = getSheetHeight(viewportHeight, headerH)
  switch (snap) {
    case 'peek': return sheetH - PEEK_H
    case 'half': return sheetH - getMobileHalfVisibleHeight(viewportHeight)
    case 'full': return 0
  }
}

function nearestSnap(px: number, viewportHeight: number, headerH: number): SnapPoint {
  return SNAP_ORDER.reduce<SnapPoint>((best, s) => {
    const bDist = Math.abs(computeSnapPx(best, viewportHeight, headerH) - px)
    const sDist = Math.abs(computeSnapPx(s, viewportHeight, headerH) - px)
    return sDist < bDist ? s : best
  }, 'half')
}

interface Props {
  snapPoint: SnapPoint
  onSnapChange: (snap: SnapPoint) => void
  children: React.ReactNode
  topInset?: number
}

export function MobileBottomSheet({ snapPoint, onSnapChange, children, topInset }: Props) {
  const effectiveHeaderH = topInset ?? HEADER_H
  const effectiveHeaderHRef = useRef(effectiveHeaderH)
  useLayoutEffect(() => {
    effectiveHeaderHRef.current = effectiveHeaderH
  }, [effectiveHeaderH])
  const [dragPx, setDragPx] = useState<number | null>(null)
  const [settlingSnap, setSettlingSnap] = useState<SnapPoint | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

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
  const viewportHeightRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    snapPointRef.current = snapPoint
    onSnapChangeRef.current = onSnapChange
  }, [onSnapChange, snapPoint])

  useEffect(() => {
    const syncViewportHeight = () => {
      const next = readViewportHeight()
      viewportHeightRef.current = next
      setViewportHeight(current => current === next ? current : next)
    }

    syncViewportHeight()
    window.addEventListener('resize', syncViewportHeight)
    window.addEventListener('orientationchange', syncViewportHeight)
    window.visualViewport?.addEventListener('resize', syncViewportHeight)

    return () => {
      window.removeEventListener('resize', syncViewportHeight)
      window.removeEventListener('orientationchange', syncViewportHeight)
      window.visualViewport?.removeEventListener('resize', syncViewportHeight)
    }
  }, [])

  const startDrag = useCallback((startY: number) => {
    const currentViewportHeight = viewportHeightRef.current ?? readViewportHeight()
    if (currentViewportHeight === null) return
    isDragging.current      = true
    hasDraggedRef.current   = false
    touchStartY.current     = startY
    touchStartSnapPx.current = computeSnapPx(snapPointRef.current, currentViewportHeight, effectiveHeaderHRef.current)
    lastTouchY.current      = startY
    lastTouchTime.current   = Date.now()
    velocityRef.current     = 0
  }, [])

  const updateDrag = useCallback((currentY: number) => {
    if (!isDragging.current) return
    const currentViewportHeight = viewportHeightRef.current ?? readViewportHeight()
    if (currentViewportHeight === null) return
    const now      = Date.now()
    const dt       = now - lastTouchTime.current

    if (dt > 0) {
      velocityRef.current = (currentY - lastTouchY.current) / dt
    }
    lastTouchY.current  = currentY
    lastTouchTime.current = now

    const delta  = currentY - touchStartY.current
    const sheetH = getSheetHeight(currentViewportHeight, effectiveHeaderHRef.current)
    const newPx  = Math.max(0, Math.min(touchStartSnapPx.current + delta, sheetH - PEEK_H))

    if (Math.abs(delta) > 4) hasDraggedRef.current = true

    dragPxRef.current = newPx
    setDragPx(newPx)
  }, [])

  const finishDrag = useCallback((expandPeekOnTap: boolean) => {
    if (!isDragging.current) return
    const currentViewportHeight = viewportHeightRef.current ?? readViewportHeight()
    if (currentViewportHeight === null) return
    isDragging.current = false

    if (!hasDraggedRef.current && expandPeekOnTap && snapPointRef.current === 'peek') {
      setDragPx(null)
      dragPxRef.current = null
      onSnapChangeRef.current('half')
      return
    }

    const currentIdx = SNAP_ORDER.indexOf(snapPointRef.current)
    let next: SnapPoint

    if (velocityRef.current > FLING_THRESHOLD) {
      next = SNAP_ORDER[Math.max(0, currentIdx - 1)]
    } else if (velocityRef.current < -FLING_THRESHOLD) {
      next = SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, currentIdx + 1)]
    } else {
      next = nearestSnap(
        dragPxRef.current ?? computeSnapPx(snapPointRef.current, currentViewportHeight, effectiveHeaderHRef.current),
        currentViewportHeight,
        effectiveHeaderHRef.current,
      )
    }

    setSettlingSnap(next === snapPointRef.current ? null : next)
    dragPxRef.current = null
    setDragPx(null)
    onSnapChangeRef.current(next)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startDrag(e.touches[0].clientY)
  }, [startDrag])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    updateDrag(e.touches[0].clientY)
    e.preventDefault()
  }, [updateDrag])

  const handleTouchEnd = useCallback(() => {
    finishDrag(true)
  }, [finishDrag])

  const handleTouchCancel = useCallback(() => {
    finishDrag(true)
  }, [finishDrag])

  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    setSettlingSnap(null)
  }, [])

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

    function originatesFromNoDragChild(target: EventTarget | null): boolean {
      const node = target as HTMLElement | null
      return !!node?.closest?.('[data-no-sheet-drag]')
    }

    function handleTouchStart(e: TouchEvent) {
      if (originatesFromNoDragChild(e.target)) return
      contentTouchStartY = e.touches[0].clientY
    }

    function handleTouchMove(e: TouchEvent) {
      if (originatesFromNoDragChild(e.target)) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - contentTouchStartY
      const snap   = snapPointRef.current
      const scrollTop = getScrollTop(e.target)
      const shouldDragUp = (snap === 'peek' || snap === 'half') && deltaY < -6
      const shouldDragDown = (snap === 'half' || snap === 'full') && deltaY > 6 && scrollTop <= 0

      if (!isDragging.current) {
        if (!shouldDragUp && !shouldDragDown) return
        startDrag(contentTouchStartY)
      }

      updateDrag(currentY)
      e.preventDefault()
    }

    function handleTouchEnd() {
      finishDrag(false)
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [finishDrag, startDrag, updateDrag])

  const restingSnap = settlingSnap ?? snapPoint
  const resolvedViewportHeight = viewportHeight ?? readViewportHeight()
  const translateY = dragPx !== null
    ? `${dragPx}px`
    : resolvedViewportHeight === null
      ? `translateY(${restingSnap === 'full' ? '0px' : restingSnap === 'peek'
        ? `calc(100dvh - ${effectiveHeaderH}px - ${PEEK_H}px)`
        : `calc(${(1 - HALF_VISIBLE_RATIO) * 100}dvh - ${effectiveHeaderH}px)`})`
      : `${computeSnapPx(restingSnap, resolvedViewportHeight, effectiveHeaderH)}px`
  const animate    = dragPx === null

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-20',
        'flex flex-col rounded-t-2xl',
        'bg-background/95 backdrop-blur-sm',
        'border-t border-x border-border',
        'shadow-[0_-4px_24px_rgba(0,0,0,0.07)]',
        animate && 'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
      )}
      style={{
        height: resolvedViewportHeight === null
          ? `calc(100dvh - ${effectiveHeaderH}px)`
          : `${getSheetHeight(resolvedViewportHeight, effectiveHeaderH)}px`,
        transform: resolvedViewportHeight === null && dragPx === null
          ? translateY
          : `translateY(${translateY})`,
        willChange: 'transform',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        className="shrink-0 flex flex-col items-center pt-2 pb-1 touch-none select-none cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div className="w-9 h-1 rounded-full bg-border/70" />
      </div>

      <div ref={contentRef} className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  )
}
