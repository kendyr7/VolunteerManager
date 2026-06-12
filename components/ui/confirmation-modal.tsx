'use client'

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./button"

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
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
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative bg-white rounded-3xl shadow-premium w-full max-w-md overflow-hidden border border-slate-200"
          >
            <div className="p-8 text-center">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 ${
                type === 'danger' ? 'bg-red/15 text-red' : 'bg-primary/15 text-primary'
              }`}>
                <span className="material-symbols-outlined text-[32px]">
                  {type === 'danger' ? 'warning' : 'help'}
                </span>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
            </div>

            <div className="flex gap-px bg-slate-100 border-t border-slate-100">
              <button
                onClick={onCancel}
                className="flex-1 bg-white py-4 text-sm font-bold text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-4 text-sm font-bold transition-colors ${
                  type === 'danger' 
                    ? 'bg-white text-red hover:bg-red-50' 
                    : 'bg-white text-primary hover:bg-primary/5'
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
