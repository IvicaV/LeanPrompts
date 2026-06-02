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
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Droplets } from 'lucide-react';
import { COLLECTION_COLOR_PALETTE, DISABLED_COLOR, DEFAULT_OPACITY, MIN_OPACITY, MAX_OPACITY } from '../utils/collectionColors';

/**
 * COLLECTION COLOR PICKER POPUP
 * Portal-based popup for selecting a collection's display color + opacity.
 * Uses click-outside detection instead of a backdrop, so scroll events pass through.
 */
export default function CollectionColorPicker({ anchorRect, currentColor, currentOpacity, onColorChange, onOpacityChange, onClose }) {
    const [localOpacity, setLocalOpacity] = useState(currentOpacity ?? DEFAULT_OPACITY);
    const popupRef = useRef(null);

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Close on click outside (without blocking scroll)
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popupRef.current && !popupRef.current.contains(e.target)) {
                onClose();
            }
        };

        // ZERO-REGRESSION: 'wheel' und 'touchmove' statt 'scroll'. 
        // Verhindert zu 100%, dass programmgesteuerte Layout-Shifts (DOM Renders) das Menü schließen.
        // Reagiert ausschließlich auf physische Nutzer-Interaktion im Hintergrund.
        const handlePhysicalScroll = (e) => {
            if (popupRef.current && popupRef.current.contains(e.target)) return;
            onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        // passive: true schützt die Scroll-Performance (60fps Garantie)
        document.addEventListener('wheel', handlePhysicalScroll, { capture: true, passive: true });
        document.addEventListener('touchmove', handlePhysicalScroll, { capture: true, passive: true });
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('wheel', handlePhysicalScroll, { capture: true });
            document.removeEventListener('touchmove', handlePhysicalScroll, { capture: true });
        };
    }, [onClose]);

    if (!anchorRect) return null;

    const style = {
        position: 'fixed',
        top: anchorRect.top - 8,
        left: anchorRect.right + 10,
        zIndex: 9999,
    };

    const isDisabled = currentColor === DISABLED_COLOR;
    const sliderPercent = ((localOpacity - MIN_OPACITY) / (MAX_OPACITY - MIN_OPACITY)) * 100;
    const activeColor = currentColor !== DISABLED_COLOR ? currentColor : '#6366f1';

    return createPortal(
        <div
            ref={popupRef}
            style={style}
            className="modal-glass-panel rounded-xl p-3 animate-in fade-in zoom-in-95 duration-150 origin-left w-[185px] dm-dropdown"
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-border/50">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Droplets size={11} />
                    Collection Color
                </span>
                <button
                    onClick={onClose}
                    className="p-0.5 rounded hover:bg-bg-elevated text-text-muted hover:text-text-main transition-colors"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Color grid */}
            <div className="grid grid-cols-5 gap-1.5 mb-3">
                {COLLECTION_COLOR_PALETTE.map(({ hex, label }) => {
                    const isActive = currentColor === hex;
                    return (
                        <button
                            key={hex}
                            onClick={() => onColorChange(hex)}
                            className={`w-7 h-7 rounded-lg transition-all duration-150 border-2 hover:scale-110 ${isActive
                                ? 'border-white/50 ring-1 ring-white/20 scale-110'
                                : 'border-transparent hover:border-white/20'
                                }`}
                            style={{ backgroundColor: hex }}
                            title={label}
                        />
                    );
                })}
            </div>

            {/* Opacity slider */}
            {!isDisabled && (
                <div className="mb-3 px-0.5">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider">Intensity</span>
                        <span className="text-[9px] font-mono text-text-muted tabular-nums">
                            {Math.round(localOpacity * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={MIN_OPACITY}
                        max={MAX_OPACITY}
                        step={0.005}
                        value={localOpacity}
                        onChange={(e) => setLocalOpacity(parseFloat(e.target.value))}
                        onMouseUp={() => onOpacityChange(localOpacity)}
                        onTouchEnd={() => onOpacityChange(localOpacity)}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{
                            background: `linear-gradient(to right, ${activeColor}33 0%, ${activeColor} ${sliderPercent}%, rgba(113,113,122,0.3) ${sliderPercent}%, rgba(113,113,122,0.3) 100%)`,
                            accentColor: activeColor,
                        }}
                    />
                </div>
            )}

            {/* Disable toggle */}
            <button
                onClick={() => onColorChange(isDisabled ? '#6366f1' : DISABLED_COLOR)}
                className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isDisabled
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-bg-elevated text-text-muted hover:text-text-main border border-transparent hover:border-border'
                    }`}
            >
                {isDisabled ? 'Enable Color' : 'No Color'}
            </button>
        </div>,
        document.body
    );
}
