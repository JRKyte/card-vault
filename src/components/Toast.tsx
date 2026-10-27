import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck } from './icons'

interface ToastOptions {
  text: string
  /** e.g. Undo. The toast closes when it's tapped. */
  action?: { label: string; onClick: () => void }
}

interface ToastState extends ToastOptions {
  key: number
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {})

/** Show a short confirmation at the bottom of the screen. A new toast replaces the old one. */
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = useCallback((t: ToastOptions) => setToast({ ...t, key: Date.now() }), [])

  useEffect(() => {
    if (!toast) return
    // Long enough to reach Undo, short enough not to linger.
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 2500)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast &&
        createPortal(
          <div
            key={toast.key}
            role="status"
            className="toast animate-fade-up fixed left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-[rgba(52,211,153,.35)] bg-[#12201c] py-2 pr-2 pl-4 text-[14px] font-semibold text-up"
            style={{ boxShadow: '0 0 24px rgba(52,211,153,.3), 0 12px 30px rgba(0,0,0,.45)' }}
          >
            <IconCheck size={18} className="flex-none" />
            <span className="truncate py-1.5">{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                className="flex-none rounded-full bg-white/10 px-4 py-2 text-[13px] font-bold text-ink hover:bg-white/15"
                onClick={() => {
                  toast.action!.onClick()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
