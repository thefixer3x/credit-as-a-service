import * as React from "react"
import { cn } from "../../lib/utils"

export interface ToastProps {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
  onDismiss?: () => void
}

export interface ToasterProps {
  className?: string
}

// Simple toast context for managing toasts
const ToastContext = React.createContext<{
  toasts: ToastProps[]
  addToast: (toast: Omit<ToastProps, "id">) => void
  removeToast: (id: string) => void
}>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([])

  const addToast = React.useCallback((toast: Omit<ToastProps, "id">) => {
    const id = Math.random().toString(36).substring(2, 15)
    setToasts((prev) => [...prev, { ...toast, id }])
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

const Toast = React.forwardRef<
  HTMLDivElement,
  ToastProps & React.HTMLAttributes<HTMLDivElement>
>(({ className, variant = "default", title, description, onDismiss, ...props }, ref) => {
  const variantClasses = {
    default: "border bg-background text-foreground",
    destructive: "destructive border-destructive bg-destructive text-destructive-foreground",
    success: "border-green-200 bg-green-50 text-green-800",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  }

  return (
    <div
      ref={ref}
      className={cn(
        "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <div className="grid gap-1">
        {title && (
          <div className="text-sm font-semibold">{title}</div>
        )}
        {description && (
          <div className="text-sm opacity-90">{description}</div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
})
Toast.displayName = "Toast"

export const Toaster = React.forwardRef<HTMLDivElement, ToasterProps>(
  ({ className }, ref) => {
    const { toasts, removeToast } = useToast()

    return (
      <div
        ref={ref}
        className={cn(
          "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
          className
        )}
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            {...toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    )
  }
)
Toaster.displayName = "Toaster"

export { Toast }