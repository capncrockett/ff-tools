import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Hover or focus to read, tap to keep open, Escape or an outside click to dismiss. */
export default function HelpTip({ label, children }: { label: string; children: string }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const pinned = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  // Chosen on open because refs cannot be read during render. Inside a modal dialog, the popup
  // must render in that dialog to stay above it.
  const [container, setContainer] = useState<Element | null>(null)
  const cancelHide = () => clearTimeout(timer.current)
  const show = () => {
    cancelHide()
    setContainer(button.current?.closest('dialog') ?? document.body)
    setOpen(true)
  }
  const close = () => {
    cancelHide()
    pinned.current = false
    setOpen(false)
  }
  const hideSoon = () => {
    cancelHide()
    if (!pinned.current && document.activeElement !== button.current)
      timer.current = setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!button.current || !popup.current) return
      const anchor = button.current.getBoundingClientRect()
      const bounds = popup.current.getBoundingClientRect()
      const left = Math.max(
        8,
        Math.min(
          anchor.left + anchor.width / 2 - bounds.width / 2,
          window.innerWidth - bounds.width - 8,
        ),
      )
      const below = anchor.bottom + 8
      const top =
        below + bounds.height <= window.innerHeight - 8
          ? below
          : Math.max(8, anchor.top - bounds.height - 8)
      setPosition({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        !button.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      ) {
        pinned.current = false
        setOpen(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        pinned.current = false
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])
  return (
    <>
      <button
        ref={button}
        type="button"
        className="help-trigger"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') show()
        }}
        onPointerLeave={hideSoon}
        onFocus={show}
        onBlur={close}
        onClick={() => {
          if (pinned.current) close()
          else {
            pinned.current = true
            show()
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open &&
        container &&
        createPortal(
          <span
            ref={popup}
            id={id}
            role="tooltip"
            className="help-popup"
            style={position}
            onPointerEnter={cancelHide}
            onPointerLeave={hideSoon}
          >
            {children}
          </span>,
          container,
        )}
    </>
  )
}
