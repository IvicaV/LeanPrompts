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
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Zero-Regression Toolbar Button
 * Standardisiert Hover- und Active-States, lässt aber lokale Überschreibungen via className zu.
 */
const ToolbarButton = React.forwardRef(({
  children,
  variant = 'ghost', // 'ghost' | 'elevated' | 'action' | 'danger'
  isActive = false,
  activeClass = '', // Erlaubt spezifische Active-Styles (z.B. Grün für 'Saved')
  className = '',
  ...props
}, ref) => {
  // Basis-DNA: Flexbox-Zentrierung, flüssige Übergänge, kein Outline-Rahmen beim Klicken
  const baseStyles = "flex items-center justify-center transition-all duration-200 select-none outline-none";

  // Die 4 standardisierten visuellen Varianten
  const variants = {
    ghost: "p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-bg-hover border border-transparent",
    elevated: "px-3 py-1.5 rounded-md text-xs font-medium bg-bg-elevated text-text-muted hover:text-text-main hover:border-text-muted border border-border",
    action: "px-3 py-1.5 rounded-md text-xs font-medium bg-bg-elevated text-text-main border border-border hover:border-primary/50 hover:text-primary hover:bg-primary/5",
    danger: "p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 border border-transparent"
  };

  // Standard-Zustände, wenn isActive === true
  const defaultActiveStyles = {
    ghost: "bg-bg-elevated text-primary", 
    elevated: "bg-primary text-white shadow-lg shadow-primary/20 border-primary",
    action: "bg-green-500/10 text-green-500 border-green-500/20",
    danger: "bg-red-500/10 text-red-500 border-red-500/20"
  };

  const appliedActiveClass = isActive ? (activeClass || defaultActiveStyles[variant]) : "";

  return (
    <button
      ref={ref}
      // twMerge eliminiert CSS-Bleeding und Konflikte intelligent
      className={twMerge(clsx(baseStyles, variants[variant], appliedActiveClass, className))}
      {...props}
    >
      {children}
    </button>
  );
});

ToolbarButton.displayName = 'ToolbarButton';
export default ToolbarButton;
