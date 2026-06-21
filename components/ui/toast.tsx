'use client'

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  isVisible: boolean
  onClose: () => void
}

export function Toast({ message, type = 'success', isVisible, onClose }: ToastProps) {
  React.useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isVisible, onClose])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed top-8 right-8 z-[100] flex items-center gap-3 bg-white dark:bg-dark2 border border-slate-200 dark:border-border px-5 py-4 rounded-2xl shadow-premium min-w-[300px]"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            type === 'success' ? 'bg-accent/15 text-accent dark:bg-accent/20' : 
            type === 'error' ? 'bg-red/15 text-red dark:bg-red/20' : 
            'bg-[#4d7cfe]/15 text-[#4d7cfe] dark:bg-[#4d7cfe]/20'
          }`}>
            <span className="material-symbols-outlined text-[24px]">
              {type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold font-inter text-slate-800 dark:text-text">{message}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-text-dim hover:text-slate-600 dark:hover:text-text transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
