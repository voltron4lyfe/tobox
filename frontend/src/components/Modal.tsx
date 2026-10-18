import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Native <dialog> modal: Esc and focus handling come from the browser.
 * Renders as a bottom sheet on small screens and a centred panel on larger ones.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  position = 'center',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  position?: 'center' | 'top'
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (the Esc button), overriding React's
      // autoFocus. Move focus to an explicit target or the first field instead.
      dialog
        .querySelector<HTMLElement>(
          '[data-autofocus], input:not([type=checkbox]), textarea, select',
        )
        ?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={() => {
        // The close event is async: ignore it when it comes from our own programmatic close,
        // or when a new modal has already re-opened the dialog in the meantime.
        if (open && !ref.current?.open) onClose()
      }}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className={`m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-visible bg-transparent p-0 text-inherit backdrop:bg-slate-950/40 sm:mx-auto sm:max-w-lg ${
        position === 'top' ? 'sm:mt-[12vh]' : 'sm:my-auto'
      } ${className}`}
    >
      {open && (
        <div className="card flex max-h-[85dvh] flex-col overflow-hidden rounded-b-none pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0">
          {title && (
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className="btn-ghost -mr-2 px-2 py-1 text-xs">
                Esc
              </button>
            </div>
          )}
          <div className="overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  )
}
