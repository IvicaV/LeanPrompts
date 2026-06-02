/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * This file is part of LeanPrompts Studio.
 * 
 * LeanPrompts Studio is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * ============================================================================
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, MessageSquare, Check, CheckSquare, Square, Tags, FolderPlus } from 'lucide-react';
import TagInput from './TagInput';
import useBodyLock from '../hooks/useBodyLock';

export default function ConfirmationModal({
  isOpen,
  isLoading = false, // <--- DEFAULT FALSE GARANTIERT ZERO REGRESSION ANDERNORTS
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Yes, Proceed",
  isDangerous = false,
  // EXISTING PROPS
  showInput = false,
  inputPlaceholder = "Enter value...",
  customButtons = null, // Array of { label, onClick, variant: 'primary'|'danger'|'neutral' }
  // NEW PROPS FOR GRANULAR IMPORT
  showMultiInput = false,
  multiInputTags = [],
  onMultiInputChange = null,
  showCheckboxes = false,
  checkboxOptions = [],
  onCheckboxChange = null,
  hideCancel = false,
  children
}) {
  useBodyLock();
  const [inputValue, setInputValue] = useState("");

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) setInputValue("");
  }, [isOpen]);

  if (!isOpen) return null;

  // Wrapper for Confirm to include input value
  const handleConfirmClick = () => {
    if (showMultiInput) {
      onConfirm(multiInputTags);
    } else {
      onConfirm(inputValue);
    }
  };

  // Helper for Button Styles
  const getButtonClass = (variant) => {
    switch (variant) {
      case 'danger': return 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20';
      case 'neutral': return 'bg-bg-elevated border-border text-text-main hover:bg-bg-surface';
      case 'primary': default: return 'bg-primary hover:bg-primary-hover text-white shadow-primary/20';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 1. Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* 2. Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="modal-glass-panel w-full max-w-md max-h-[90vh] rounded-xl overflow-hidden dm-modal flex flex-col"
      >
        {/* Header */}
        <div className={`px-6 py-5 flex items-start gap-4 shrink-0 transition-colors dark:bg-[#09090b] border-b ${showCheckboxes ? 'border-border dark:border-white/5 bg-zinc-50' : 'border-transparent dark:border-white/5'}`}>
          <div className={`p-3 rounded-full shrink-0 ${isDangerous ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
            {isDangerous ? <AlertTriangle size={24} /> : <MessageSquare size={24} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text-main mb-1">
              {title}
            </h3>
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
              {message}
            </p>
          </div>
        </div>

        {/* Body Wrapper: Slightly Lighter ("Elevated") */}
        <div className="flex-1 dark:bg-[#131316] py-1 overflow-y-auto custom-scrollbar min-h-0">
          {/* NEW: Checkbox List (for Smart Import) */}
        {showCheckboxes && (
          <div className="px-6 py-4 space-y-2 bg-white dark:bg-white/[0.02]">
            <div className="text-[10px] font-bold text-text-faint uppercase tracking-wider mb-2">Select items to restore:</div>
            {checkboxOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => !opt.disabled && onCheckboxChange(opt.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${opt.disabled
                  ? 'opacity-40 cursor-not-allowed bg-transparent border-transparent'
                  : 'cursor-pointer bg-transparent hover:bg-zinc-50 dark:hover:bg-black/20 border-transparent hover:border-border dark:hover:border-white/5'
                  }`}
              >
                <div className={opt.checked && !opt.disabled ? 'text-primary' : 'text-text-muted'}>
                  {opt.checked && !opt.disabled ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex flex-col">
                  <span className={`text-sm font-medium ${opt.disabled ? 'text-text-faint' : 'text-text-main'}`}>
                    {opt.label}
                  </span>
                  {opt.disabled && <span className="text-[9px] text-amber-500/70 font-bold uppercase tracking-tighter">Missing in Backup</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Optional: Input Field (for Prompt Replacement / Categories) */}
        {showInput && (
          <div className="px-6 pb-4">
            <input
              autoFocus
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary/70 focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all placeholder:text-text-faint/60"
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmClick()}
            />
          </div>
        )}

        {/* Optional: Multi-Input (Tag Style) */}
        {showMultiInput && (
          <div className="px-6 pb-4">
            <TagInput
              tags={multiInputTags}
              onChange={onMultiInputChange}
              availableTags={[]}
              placeholder={inputPlaceholder}
              icon={<FolderPlus size={14} className="text-text-muted ml-1" />}
            />
            <p className="text-[10px] text-text-muted mt-2 ml-1 italic">
              Press Enter to add multiple items.
            </p>
          </div>
        )}

        {/* Custom Content Slot */}
        {children && (
          <div className="px-6 pb-4">
            {children}
          </div>
        )}
        </div>

        {/* Footer Buttons */}
        <div className={`border-t border-border dark:border-white/5 px-6 py-4 flex justify-end gap-3 flex-wrap transition-colors dark:bg-[#09090b] ${showCheckboxes ? 'bg-zinc-50' : 'bg-bg-surface/50'}`}>
          {customButtons ? (
            customButtons.map((btn, idx) => (
              <button
                key={idx}
                onClick={() => { btn.onClick(inputValue); }}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all ${getButtonClass(btn.variant)} ${isLoading ? 'opacity-60 cursor-wait' : ''}`}
              >
                {btn.label}
              </button>
            ))
          ) : (
            <>
              {!hideCancel && (
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-text-main border border-transparent transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-surface hover:border-border'}`}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleConfirmClick}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg transition-all ${isDangerous
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                  : 'bg-primary hover:bg-primary-hover shadow-primary/20'
                  } ${isLoading ? 'opacity-80 cursor-wait' : 'active:scale-95'}`}
              >
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing...</span>
                    </div>
                ) : (
                    confirmText
                )}
              </button>
            </>
          )}
        </div>

        {/* Close X Button top right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-main p-1"
        >
          <X size={16} />
        </button>
      </motion.div>
    </div>
  );
}