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
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, CheckSquare, Square } from 'lucide-react';
import TagInput from './TagInput';

export default function TagEditorPopover({
    isOpen,
    onClose,
    onSave,
    initialTags = [],
    availableTags = [],
    isBulk = false,
    anchorRect = null // { top, left, right, bottom } or null for center/modal
}) {
    const [tags, setTags] = useState([]);
    const [mode, setMode] = useState('append'); // 'append' | 'replace'
    const popupRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTags(initialTags || []);
            setMode('append'); // Default to append for safety
        }
    }, [isOpen, initialTags]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePhysicalScroll = (e) => {
            if (popupRef.current && popupRef.current.contains(e.target)) return;
            onClose();
        };

        document.addEventListener('wheel', handlePhysicalScroll, { capture: true, passive: true });
        document.addEventListener('touchmove', handlePhysicalScroll, { capture: true, passive: true });
        
        return () => {
            document.removeEventListener('wheel', handlePhysicalScroll, { capture: true });
            document.removeEventListener('touchmove', handlePhysicalScroll, { capture: true });
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleTagsChange = (newTags) => {
        setTags(newTags);
        // Auto-save removed. User must click Save.
    };

    const handleSave = () => {
        onSave(tags, mode);
        onClose();
    };

    let style = { zIndex: 10000 };
    
    if (anchorRect) {
        // SMART FLIP: 220px is the approx max height of the popover
        const isFlipped = (window.innerHeight - anchorRect.bottom) < 220;
        
        // SMART ALIGN: If button is on the right half of screen, align right edge, else left edge
        const alignRight = anchorRect.left > (window.innerWidth / 2);

        style = {
            ...style,
            position: 'fixed',
            // Wenn geflippt, verankere es ÜBER dem Button (bottom), sonst DARUNTER (top)
            ...(isFlipped 
                ? { bottom: window.innerHeight - anchorRect.top + 4 } 
                : { top: anchorRect.bottom + 4 }),
            // Verhindere, dass es rechts aus dem Bild ragt
            ...(alignRight 
                ? { right: window.innerWidth - anchorRect.right } 
                : { left: anchorRect.left })
        };
    } else {
        // Fallback for center modal
        style = {
            ...style,
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
        };
    }

    return createPortal(
        <>
            {/* Dimmer & Blur backdrop for isolation */}
            <div 
                className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200" 
                onClick={onClose} 
            />
            <div
                ref={popupRef}
                className="modal-glass-panel rounded-xl p-2 w-[280px] flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                style={style}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border/50 px-1 pb-2 mb-2">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                        {isBulk ? 'Manage Tags (Bulk)' : 'Edit Tags'}
                    </span>
                    <button 
                        onClick={onClose} 
                        className="text-text-muted hover:text-text-main p-1 rounded hover:bg-bg-elevated transition-colors"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex-1">
                    <TagInput
                        tags={tags}
                        onChange={handleTagsChange}
                        availableTags={availableTags}
                        placeholder={mode === 'remove' ? "Select tags to remove..." : "Add tags..."}
                    />
                </div>

                {isBulk && (
                    <>
                        <div className="flex flex-col gap-2 p-2 bg-bg-elevated/30 rounded-lg border border-border/50">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-3 h-3 rounded border flex items-center justify-center ${mode === 'append' ? 'bg-primary border-primary' : 'border-text-muted group-hover:border-text-main'}`}>
                                    {mode === 'append' && <CheckSquare size={10} className="text-white" />}
                                </div>
                                <input
                                    type="radio"
                                    name="tagMode"
                                    value="append"
                                    checked={mode === 'append'}
                                    onChange={() => { setMode('append'); setTags([]); }}
                                    className="hidden"
                                />
                                <span className="text-xs text-text-muted group-hover:text-text-main">Append to existing tags</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-3 h-3 rounded border flex items-center justify-center ${mode === 'replace' ? 'bg-primary border-primary' : 'border-text-muted group-hover:border-text-main'}`}>
                                    {mode === 'replace' && <CheckSquare size={10} className="text-white" />}
                                </div>
                                <input
                                    type="radio"
                                    name="tagMode"
                                    value="replace"
                                    checked={mode === 'replace'}
                                    onChange={() => { setMode('replace'); setTags([]); }}
                                    className="hidden"
                                />
                                <span className="text-xs text-text-muted group-hover:text-text-main">Replace all existing tags</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-3 h-3 rounded border flex items-center justify-center ${mode === 'remove' ? 'bg-red-500 border-red-500' : 'border-text-muted group-hover:border-text-main'}`}>
                                    {mode === 'remove' && <CheckSquare size={10} className="text-white" />}
                                </div>
                                <input
                                    type="radio"
                                    name="tagMode"
                                    value="remove"
                                    checked={mode === 'remove'}
                                    onChange={() => { setMode('remove'); setTags([]); }}
                                    className="hidden"
                                />
                                <span className="text-xs text-text-muted group-hover:text-text-main">Remove tags from selection</span>
                            </label>
                        </div>

                    </>
                )}

                <button
                    type="button"
                    onClick={handleSave}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2
                        ${isBulk 
                            ? 'bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20' 
                            : 'bg-bg-elevated border border-border text-text-main hover:bg-bg-hover hover:border-primary/50'
                        }`}
                >
                    <Save size={14} />
                    {isBulk ? 'Execute Bulk Action' : 'Done'}
                </button>
            </div>
        </>,
        document.body
    );
}
