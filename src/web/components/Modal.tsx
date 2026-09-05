import { useEffect, useRef, type ReactNode } from 'react'

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const trigger = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="btn btn-sm btn-ghost" aria-label="Close dialog" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
