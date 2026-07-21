'use client'

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./button"

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: React.ReactNode
  confirmText: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'danger' | 'primary'
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  type = 'primary'
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative bg-white dark:bg-dark2 rounded-3xl shadow-premium w-full max-w-md overflow-hidden border border-slate-200 dark:border-border"
          >
            <div className="p-8 text-center">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 ${
                type === 'danger' ? 'bg-red/15 text-red dark:bg-red/20' : 'bg-[#4d7cfe]/15 text-[#4d7cfe] dark:bg-[#4d7cfe]/20'
              }`}>
                <span className="material-symbols-outlined text-[32px]">
                  {type === 'danger' ? 'warning' : 'help'}
                </span>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-text mb-2">{title}</h3>
              <div className="text-sm text-slate-500 dark:text-text-dim leading-relaxed font-inter font-bold">{message}</div>
            </div>

            <div className="flex gap-px bg-slate-100 dark:bg-border border-t border-slate-100 dark:border-border">
              <button
                onClick={onCancel}
                className="flex-1 bg-white dark:bg-dark2 py-4 text-sm font-bold text-slate-400 dark:text-text-dim hover:text-slate-800 dark:hover:text-text hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-4 text-sm font-bold transition-colors ${
                  type === 'danger' 
                    ? 'bg-white dark:bg-dark2 text-red hover:bg-red-50 dark:hover:bg-red/10' 
                    : 'bg-white dark:bg-dark2 text-[#4d7cfe] hover:bg-[#4d7cfe]/5 dark:hover:bg-[#4d7cfe]/10'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
