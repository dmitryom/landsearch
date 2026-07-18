'use client'

import { useRef } from 'react'

type ResizeAxis = 'x' | 'y'

interface ResizeHandleProps {
  axis: ResizeAxis
  value: number
  min: number
  max: number
  label: string
  onChange: (value: number) => void
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function ResizeHandle({ axis, value, min, max, label, onChange, className = '' }: ResizeHandleProps) {
  const dragRef = useRef<{ startPoint: number; startValue: number } | null>(null)

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const startPoint = axis === 'x' ? event.clientX : event.clientY
    dragRef.current = { startPoint, startValue: value }
    element.setPointerCapture(event.pointerId)

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const point = axis === 'x' ? moveEvent.clientX : moveEvent.clientY
      onChange(clamp(drag.startValue + point - drag.startPoint, min, max))
    }

    const handleUp = (upEvent: PointerEvent) => {
      dragRef.current = null
      element.releasePointerCapture(upEvent.pointerId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const positive = axis === 'x' ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    const negative = axis === 'x' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    if (positive || negative) {
      event.preventDefault()
      onChange(clamp(value + (positive ? 16 : -16), min, max))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(min)
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange(max)
    }
  }

  return (
    <button
      type="button"
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={`ls-resize-handle ${axis === 'x' ? 'ls-resize-handle-x' : 'ls-resize-handle-y'} ${className}`}
    >
      <span aria-hidden="true" />
    </button>
  )
}
