'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Pin, PinOff, RotateCcw } from 'lucide-react'

import { safeGet, safeSet } from '@/lib/storage'

const EDGE_MARGIN = 8
const DEFAULT_POSITION = { x: 0, y: 0, pinned: true }
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [data-no-panel-drag]'

type PanelPosition = typeof DEFAULT_POSITION
type PanelAnchor = 'top-right' | 'bottom-right' | 'bottom-center'

type ActiveDrag = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  minDeltaX: number
  maxDeltaX: number
  minDeltaY: number
  maxDeltaY: number
  captureTarget: HTMLElement
}

export type DraggablePanelControls = {
  pinned: boolean
  canDrag: boolean
  hasCustomPosition: boolean
  dragHandleProps: HTMLAttributes<HTMLElement>
  togglePinned: () => void
  resetPosition: () => void
}

type DraggableMapPanelProps = {
  storageKey: string
  anchor: PanelAnchor
  className?: string
  disabled?: boolean
  children: (controls: DraggablePanelControls) => ReactNode
}

function parsePosition(value: string | null): PanelPosition {
  if (!value) return DEFAULT_POSITION

  try {
    const parsed = JSON.parse(value) as Partial<PanelPosition>
    if (
      typeof parsed.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.y) &&
      typeof parsed.pinned === 'boolean'
    ) {
      return { x: parsed.x, y: parsed.y, pinned: parsed.pinned }
    }
  } catch {
    // Ignore stale or manually edited layout state.
  }

  return DEFAULT_POSITION
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function PanelPositionControls({
  controls,
  className = '',
}: {
  controls: DraggablePanelControls
  className?: string
}) {
  return (
    <div
      className={`hidden items-center gap-1 md:flex ${className}`}
      data-no-panel-drag
    >
      <button
        type="button"
        className="ls-control grid h-8 w-8 place-items-center"
        aria-label={controls.pinned ? 'Открепить панель' : 'Закрепить панель'}
        aria-pressed={controls.pinned}
        title={controls.pinned ? 'Открепить и перемещать' : 'Закрепить положение'}
        disabled={!controls.canDrag}
        onClick={controls.togglePinned}
      >
        {controls.pinned ? <PinOff size={15} /> : <Pin size={15} />}
      </button>
      <button
        type="button"
        className="ls-control grid h-8 w-8 place-items-center"
        aria-label="Вернуть исходное положение"
        title="Вернуть исходное положение"
        disabled={!controls.canDrag || !controls.hasCustomPosition}
        onClick={controls.resetPosition}
      >
        <RotateCcw size={15} />
      </button>
    </div>
  )
}

export default function DraggableMapPanel({
  storageKey,
  anchor,
  className = '',
  disabled = false,
  children,
}: DraggableMapPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<ActiveDrag | null>(null)
  const positionRef = useRef<PanelPosition>(DEFAULT_POSITION)
  const [position, setPosition] = useState<PanelPosition>(DEFAULT_POSITION)
  const [hydrated, setHydrated] = useState(false)
  const [isMobile, setIsMobile] = useState(true)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const nextPosition = parsePosition(safeGet(storageKey))
    positionRef.current = nextPosition
    setPosition(nextPosition)
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    positionRef.current = position
    if (hydrated) safeSet(storageKey, JSON.stringify(position))
  }, [hydrated, position, storageKey])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const updateMode = () => setIsMobile(mediaQuery.matches)
    updateMode()
    mediaQuery.addEventListener('change', updateMode)
    return () => mediaQuery.removeEventListener('change', updateMode)
  }, [])

  const canDrag = hydrated && !isMobile && !disabled

  const clampIntoBounds = useCallback(() => {
    const panel = panelRef.current
    const boundary = panel?.parentElement
    if (!panel || !boundary || isMobile || disabled) return

    const panelRect = panel.getBoundingClientRect()
    const boundaryRect = boundary.getBoundingClientRect()
    let deltaX = 0
    let deltaY = 0

    if (panelRect.left < boundaryRect.left + EDGE_MARGIN) {
      deltaX = boundaryRect.left + EDGE_MARGIN - panelRect.left
    } else if (panelRect.right > boundaryRect.right - EDGE_MARGIN) {
      deltaX = boundaryRect.right - EDGE_MARGIN - panelRect.right
    }

    if (panelRect.top < boundaryRect.top + EDGE_MARGIN) {
      deltaY = boundaryRect.top + EDGE_MARGIN - panelRect.top
    } else if (panelRect.bottom > boundaryRect.bottom - EDGE_MARGIN) {
      deltaY = boundaryRect.bottom - EDGE_MARGIN - panelRect.bottom
    }

    if (deltaX || deltaY) {
      setPosition((current) => ({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY,
      }))
    }
  }, [disabled, isMobile])

  useEffect(() => {
    if (!hydrated || isMobile || disabled) return
    const animationFrame = requestAnimationFrame(clampIntoBounds)
    window.addEventListener('resize', clampIntoBounds)
    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', clampIntoBounds)
    }
  }, [clampIntoBounds, disabled, hydrated, isMobile])

  useEffect(() => {
    const finishDrag = (event: PointerEvent) => {
      const active = dragRef.current
      if (!active || active.pointerId !== event.pointerId) return

      if (active.captureTarget.hasPointerCapture(active.pointerId)) {
        active.captureTarget.releasePointerCapture(active.pointerId)
      }
      dragRef.current = null
      setDragging(false)
    }

    const movePanel = (event: PointerEvent) => {
      const active = dragRef.current
      if (!active || active.pointerId !== event.pointerId) return

      const deltaX = clamp(
        event.clientX - active.startClientX,
        active.minDeltaX,
        active.maxDeltaX,
      )
      const deltaY = clamp(
        event.clientY - active.startClientY,
        active.minDeltaY,
        active.maxDeltaY,
      )

      setPosition((current) => ({
        ...current,
        x: active.startX + deltaX,
        y: active.startY + deltaY,
      }))
    }

    window.addEventListener('pointermove', movePanel)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    return () => {
      window.removeEventListener('pointermove', movePanel)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    }
  }, [])

  const moveBy = useCallback(
    (deltaX: number, deltaY: number) => {
      const panel = panelRef.current
      const boundary = panel?.parentElement
      if (!panel || !boundary || !canDrag || positionRef.current.pinned) return

      const panelRect = panel.getBoundingClientRect()
      const boundaryRect = boundary.getBoundingClientRect()
      const nextDeltaX = clamp(
        deltaX,
        boundaryRect.left + EDGE_MARGIN - panelRect.left,
        boundaryRect.right - EDGE_MARGIN - panelRect.right,
      )
      const nextDeltaY = clamp(
        deltaY,
        boundaryRect.top + EDGE_MARGIN - panelRect.top,
        boundaryRect.bottom - EDGE_MARGIN - panelRect.bottom,
      )

      setPosition((current) => ({
        ...current,
        x: current.x + nextDeltaX,
        y: current.y + nextDeltaY,
      }))
    },
    [canDrag],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!canDrag || positionRef.current.pinned || event.button !== 0) return
      const target = event.target as HTMLElement
      const interactiveTarget = target.closest(INTERACTIVE_SELECTOR)
      if (interactiveTarget && interactiveTarget !== event.currentTarget) return

      const panel = panelRef.current
      const boundary = panel?.parentElement
      if (!panel || !boundary) return

      const panelRect = panel.getBoundingClientRect()
      const boundaryRect = boundary.getBoundingClientRect()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: positionRef.current.x,
        startY: positionRef.current.y,
        minDeltaX: boundaryRect.left + EDGE_MARGIN - panelRect.left,
        maxDeltaX: boundaryRect.right - EDGE_MARGIN - panelRect.right,
        minDeltaY: boundaryRect.top + EDGE_MARGIN - panelRect.top,
        maxDeltaY: boundaryRect.bottom - EDGE_MARGIN - panelRect.bottom,
        captureTarget: event.currentTarget,
      }
      setDragging(true)
      event.preventDefault()
    },
    [canDrag],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!canDrag || positionRef.current.pinned) return
      const step = event.shiftKey ? 24 : 8

      if (event.key === 'Home') {
        setPosition((current) => ({ ...current, x: 0, y: 0 }))
        event.preventDefault()
        return
      }

      const offsets: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const offset = offsets[event.key]
      if (!offset) return
      moveBy(offset[0], offset[1])
      event.preventDefault()
    },
    [canDrag, moveBy],
  )

  const controls = useMemo<DraggablePanelControls>(
    () => ({
      pinned: position.pinned,
      canDrag,
      hasCustomPosition: position.x !== 0 || position.y !== 0,
      dragHandleProps: {
        onPointerDown,
        onKeyDown,
        tabIndex: canDrag && !position.pinned ? 0 : undefined,
        role: canDrag && !position.pinned ? 'button' : undefined,
        'aria-label': canDrag && !position.pinned ? 'Переместить панель' : undefined,
        'data-panel-drag-handle': true,
      },
      togglePinned: () => {
        if (!canDrag) return
        setPosition((current) => ({ ...current, pinned: !current.pinned }))
      },
      resetPosition: () => {
        if (!canDrag) return
        setPosition((current) => ({ ...current, x: 0, y: 0 }))
      },
    }),
    [canDrag, onKeyDown, onPointerDown, position.pinned, position.x, position.y],
  )

  const visibleX = disabled ? 0 : position.x
  const visibleY = disabled ? 0 : position.y
  const transform =
    anchor === 'bottom-center'
      ? `translate3d(calc(-50% + ${visibleX}px), ${visibleY}px, 0)`
      : `translate3d(${visibleX}px, ${visibleY}px, 0)`
  const style = {
    transform,
    touchAction: canDrag && !position.pinned ? 'none' : 'auto',
  } satisfies CSSProperties

  return (
    <div
      ref={panelRef}
      className={`draggable-map-panel ${dragging ? 'select-none' : ''} ${className}`}
      style={style}
      data-panel-pinned={position.pinned}
    >
      {children(controls)}
      <style jsx>{`
        @media (max-width: 767px) {
          .draggable-map-panel {
            transform: none !important;
            touch-action: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
