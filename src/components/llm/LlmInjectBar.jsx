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
import { AlertTriangle, Send } from 'lucide-react';
import useModifierKeys from '../../hooks/useModifierKeys';
import { getFaviconUrl } from '../../utils/faviconHelper';

/**
 * ATOMIC COMPONENT 1: The Reactive Label
 * ZERO LAYOUT SHIFT & ZERO STATE LEAKAGE
 */
export function LlmInjectLabel({ context = "step", hasGhostFiles = false }) {
    const { ctrl, shift } = useModifierKeys();
    
    const baseColor = "text-text-muted";
    const hoverColorClass = ctrl 
        ? 'group-hover/llmbar:text-indigo-600 dark:group-hover/llmbar:text-purple-400' 
        : shift 
            ? 'group-hover/llmbar:text-emerald-600 dark:group-hover/llmbar:text-emerald-400' 
            : 'group-hover/llmbar:text-text-main';

    const opacityClass = context === "popup" ? "opacity-60 group-hover/llmbar:opacity-100" : "";
    const colorClass = `${baseColor} ${opacityClass} ${hoverColorClass}`;

    const textDefault = context === "popup" ? "Quick Launch" : "Direct Inject";
    const textCtrl = context === "step" ? "New Chat:" : "New Chat & Inject";
    const textShift = context === "step" ? "Open Only:" : "Open Only (No Inject)";
    const textSuffix = context === "step" ? ":" : "";

    const activeHoverText = ctrl ? textCtrl : shift ? textShift : (textDefault + textSuffix);
    const idleText = textDefault + (context === "step" ? textSuffix : "");

    const widthClass = (context === "inspector" || context === "popup") ? "w-[145px]" : "w-[90px]";

    const renderContent = () => (
        <>
            {context === "step" && <Send size={10} className={ctrl || shift ? "group-hover/llmbar:animate-pulse" : ""} />}
            <div className="grid items-center">
                <span className="col-start-1 row-start-1 transition-opacity duration-200 opacity-100 group-hover/llmbar:opacity-0 pointer-events-none">
                    {idleText}
                </span>
                <span className="col-start-1 row-start-1 transition-opacity duration-200 opacity-0 group-hover/llmbar:opacity-100 pointer-events-none whitespace-nowrap">
                    {activeHoverText}
                </span>
            </div>
        </>
    );

    if (context === "popup") {
        return (
            <div className="absolute -top-4 left-3 flex items-center z-30 pointer-events-none bg-white/70 dark:bg-[#18181b]/80 backdrop-blur-md px-2.5 py-0.5 rounded-t-lg border-x border-t border-border/40 dark:border-white/5 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors duration-200 ${colorClass}`}>
                    {renderContent()}
                </div>
                {hasGhostFiles && (
                    <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-2">
                        <AlertTriangle size={9} className="text-amber-500 animate-pulse" />
                        <span className="text-[8.5px] font-bold text-amber-500 uppercase tracking-widest">Missing Files</span>
                    </div>
                )}
            </div>
        );
    }

    if (context === "inspector") {
        return (
            <div className={`px-4 pt-3 pb-1 h-8 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 ${colorClass}`}>
                {renderContent()}
            </div>
        );
    }

    return (
        <div className={`h-8 flex items-center gap-1.5 shrink-0 transition-colors duration-200 text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>
            {renderContent()}
        </div>
    );
}

/**
 * ATOMIC COMPONENT 2: The Interactive Logo Button
 * CLIPPING-SAFE: No scale, no bounding-box-breaking shadows. Uses internal visual shifts.
 */
export function LlmIconButton({ llm, onClick, tooltip, size = "md" }) {
    const { ctrl, shift } = useModifierKeys();
    
    const isSm = size === "sm";
    const baseClasses = isSm ? "w-6 h-6 rounded-md p-1" : "w-8 h-8 rounded-lg p-1.5";
    
    // Hintergrundfarbe der LEISTE (group) ändern, aber KEINE Drop-Shadows (die clippen im Scroll-Container)
    const activeClasses = ctrl 
        ? 'group-hover/llmbar:border-indigo-400/50 dark:group-hover/llmbar:border-purple-500/50 group-hover/llmbar:bg-indigo-50 dark:group-hover/llmbar:bg-purple-900/20' 
        : shift 
            ? 'group-hover/llmbar:border-emerald-400/50 dark:group-hover/llmbar:border-emerald-500/50 group-hover/llmbar:bg-emerald-50 dark:group-hover/llmbar:bg-emerald-900/20' 
            : '';

    // Wenn Modifier aktiv: Logos farbig, aber nur 80% Deckkraft (lässt Spielraum für den Hover-Pop)
    const imgClasses = (ctrl || shift) ? 'group-hover/llmbar:grayscale-0 group-hover/llmbar:opacity-80' : '';

    return (
        <button
            onClick={onClick}
            // Hover-Effekte greifen nur innerhalb des Buttons (Rahmen & Farbe). Kein scale!
            className={`flex items-center justify-center flex-shrink-0 relative group/icon transition-all border bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/40 ${baseClasses} ${activeClasses}`}
            title={tooltip}
        >
            {/* INNER OVERLAY: Simuliert den taktilen Klick/Hover durch leichte Abdunklung/Aufhellung ohne das Layout zu sprengen */}
            <div className="absolute inset-0 bg-transparent group-hover/icon:bg-black/5 dark:group-hover/icon:bg-white/10 rounded-[inherit] pointer-events-none transition-colors z-20"></div>
            
            {/* LOGO: Springt bei exaktem Hovern auf 100% Deckkraft */}
            <img
                src={getFaviconUrl(llm.url, llm.name)}
                alt={llm.name}
                className={`w-full h-full object-contain filter transition-all relative z-10 dark:invert-[0.8] dark:hue-rotate-180 grayscale opacity-60 dark:opacity-60 group-hover/icon:grayscale-0 group-hover/icon:opacity-100 ${imgClasses}`}
            />
        </button>
    );
}
