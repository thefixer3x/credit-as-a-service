'use client'

import { ToastProvider } from '@caas/ui-kit'

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}