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
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles, Command, MousePointer2, ExternalLink, Zap } from 'lucide-react';
import useOnboardingStore from '../../stores/onboardingStore';

export default function OnboardingFlow({ steps = [], type }) {
    const { currentStep, nextStep, prevStep, completeTour, skipTour, isTourActive, tourType } = useOnboardingStore();
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
    const [tooltipPos, setTooltipPos] = useState({
        top: typeof window !== 'undefined' ? window.innerHeight / 2 - 100 : 0,
        left: typeof window !== 'undefined' ? window.innerWidth / 2 - 150 : 0
    });
    const [isReady, setIsReady] = useState(false);
    const tooltipRef = useRef(null);

    const activeStep = steps[currentStep];

    const isActive = isTourActive && tourType === type;

    useEffect(() => {
        if (!isActive || !activeStep) return;

        // NEW: Call activation hook if provided for this step
        if (typeof activeStep.onActivate === 'function') {
            activeStep.onActivate();
        }

        const updatePosition = () => {
            const element = activeStep.target ? document.querySelector(activeStep.target) : null;

            if (element) {
                const rect = element.getBoundingClientRect();
                setCoords({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                });

                // Calculate Tooltip Position
                const padding = 12;
                let tTop = rect.bottom + padding;
                let tLeft = rect.left + (rect.width / 2);

                if (activeStep.position === 'top') {
                    tTop = rect.top - padding - (tooltipRef.current?.offsetHeight || 100);
                } else if (activeStep.position === 'left') {
                    tTop = rect.top + (rect.height / 2) - ((tooltipRef.current?.offsetHeight || 100) / 2);
                    tLeft = rect.left - padding - (tooltipRef.current?.offsetWidth || 250);
                } else if (activeStep.position === 'right') {
                    tTop = rect.top + (rect.height / 2) - ((tooltipRef.current?.offsetHeight || 100) / 2);
                    tLeft = rect.right + padding;
                }

                // Keep within viewport
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                const tW = tooltipRef.current?.offsetWidth || 280;
                const tH = tooltipRef.current?.offsetHeight || 150;

                if (tLeft + tW > winW - 20) tLeft = winW - tW - 20;
                if (tLeft < 20) tLeft = 20;
                if (tTop + tH > winH - 20) tTop = winH - tH - 20;
                if (tTop < 20) tTop = 20;

                setTooltipPos({ top: tTop, left: tLeft });

                // Highlight effect: scroll into view safely without shifting entire Dashboard body
                const scrollParent = element.closest('.overflow-y-auto, .overflow-auto, .custom-scrollbar');
                if (scrollParent) {
                    const parentRect = scrollParent.getBoundingClientRect();
                    const elRect = element.getBoundingClientRect();
                    scrollParent.scrollTo({
                        top: scrollParent.scrollTop + (elRect.top - parentRect.top) - (parentRect.height / 2) + (elRect.height / 2),
                        behavior: 'smooth'
                    });
                } else {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                // FALLBACK: Center of screen if no target OR target not found in DOM
                setCoords({ top: 0, left: 0, width: 0, height: 0 });
                setTooltipPos({
                    top: (window.innerHeight / 2) - 100,
                    left: (window.innerWidth / 2) - 150
                });
            }
            setIsReady(true);
        };

        // If a target exists, we wait a bit longer for potential animations/collapses to finish
        const delay = activeStep.target ? 300 : 100;

        updatePosition();
        window.addEventListener('resize', updatePosition);
        const timer = setTimeout(updatePosition, delay);

        return () => {
            window.removeEventListener('resize', updatePosition);
            clearTimeout(timer);
        };
    }, [currentStep, isActive, activeStep]);

    if (!isActive || !activeStep) return null;

    const isLast = currentStep === steps.length - 1;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden font-sans">
            {/* Backdrop with Spotlight */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 pointer-events-auto"
                style={{
                    clipPath: coords.width > 0
                        ? `polygon(0% 0%, 0% 100%, ${coords.left}px 100%, ${coords.left}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top + coords.height}px, ${coords.left}px ${coords.top + coords.height}px, ${coords.left}px 100%, 100% 100%, 100% 0%)`
                        : 'none'
                }}
                onClick={skipTour}
            />

            {/* Tooltip Content */}
            <motion.div
                ref={tooltipRef}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{
                    opacity: isReady ? 1 : 0,
                    scale: isReady ? 1 : 0.9,
                    y: isReady ? 0 : 10,
                    top: tooltipPos.top,
                    left: tooltipPos.left
                }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="absolute z-50 w-[320px] bg-bg-surface border border-primary/30 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col"
            >
                {/* Header Decoration */}
                <div className="h-1 bg-gradient-to-r from-primary via-blue-400 to-purple-500" />

                <div className="p-5">
                    <div className="flex items-center justify-between mb-3 text-primary">
                        <div className="flex items-center gap-2">
                            {activeStep.icon || <Sparkles size={18} className="animate-pulse" />}
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Step {currentStep + 1} of {steps.length}</span>
                        </div>
                        <button
                            onClick={skipTour}
                            className="p-1 hover:bg-bg-elevated rounded-full text-text-muted transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <h3 className="text-lg font-bold text-text-main mb-2 leading-tight">
                        {activeStep.title}
                    </h3>

                    <p className="text-sm text-text-muted leading-relaxed mb-6">
                        {activeStep.content}
                    </p>

                    <div className="flex items-center justify-between mt-auto">
                        <button
                            onClick={skipTour}
                            className="text-xs text-text-faint hover:text-text-muted transition-colors"
                        >
                            Skip Tour
                        </button>

                        <div className="flex items-center gap-2">
                            {currentStep > 0 && (
                                <button
                                    onClick={prevStep}
                                    className="p-2 rounded-xl border border-border bg-bg-elevated text-text-main hover:bg-bg-hover hover:border-primary/30 transition-all duration-200 active:scale-95 antialiased shadow-sm"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            )}

                            <button
                                onClick={isLast ? completeTour : nextStep}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:shadow-lg hover:bg-primary-hover transition-all duration-200 active:scale-95 antialiased"
                            >
                                {isLast ? "Got it!" : "Next"}
                                {!isLast && <ChevronRight size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Integration specific badges/tips */}
                {activeStep.tip && (
                    <div className="bg-primary/5 border-t border-primary/10 px-5 py-3 flex items-start gap-2">
                        <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-text-muted font-medium italic">
                            {activeStep.tip}
                        </span>
                    </div>
                )}
            </motion.div>

            {/* Pulsing indicator on the spotlight area */}
            {coords.width > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute border-2 border-primary rounded-lg pointer-events-none shadow-[0_0_15px_rgba(var(--color-primary),0.5)]"
                    style={{
                        top: coords.top - 2,
                        left: coords.left - 2,
                        width: coords.width + 4,
                        height: coords.height + 4
                    }}
                >
                    <motion.div
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.1, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="absolute inset-0 border-2 border-primary rounded-lg"
                    />
                </motion.div>
            )}
        </div>
    );
}
