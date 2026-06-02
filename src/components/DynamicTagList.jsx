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
import React, { useState, useRef, useLayoutEffect } from 'react';

/**
 * UNIVERSAL DYNAMIC TAG LIST
 * Calculates how many tags fit in one line based on available width.
 * Prevents layout flickering and handles long tags with truncation.
 */
export default function DynamicTagList({ tags = [], maxTagWidth = 100 }) {
    const measureRef = useRef(null);
    const containerRef = useRef(null);
    const [displayCount, setDisplayCount] = useState(tags.length);

    useLayoutEffect(() => {
        const updateCount = () => {
            if (!measureRef.current || !containerRef.current) return;
            const measureContainer = measureRef.current;
            const container = containerRef.current;
            const containerWidth = container.offsetWidth;

            // Safety: If container is hidden or zero-width, don't re-render with 0
            if (containerWidth <= 0) return;

            const children = Array.from(measureContainer.children).filter(c => c.classList.contains('dtl-tag-measure'));
            if (children.length === 0) {
                if (displayCount !== 0) setDisplayCount(0);
                return;
            }

            // Margin/Gap between tags (1.5 * 4px for gap-1.5)
            const gap = 6;
            const badgeWidth = 32;

            let currentWidth = 0;
            let fitCount = 0;

            for (let i = 0; i < children.length; i++) {
                const childWidth = children[i].offsetWidth;
                const nextTotal = currentWidth + childWidth + (fitCount > 0 ? gap : 0);

                // CRITICAL: Always allow at least ONE tag if tags exist
                if (fitCount === 0 || nextTotal <= containerWidth) {
                    currentWidth = nextTotal;
                    fitCount++;
                } else {
                    break;
                }
            }

            // If not all fit, we need to make room for the "+X" badge
            let finalCount = fitCount;
            if (fitCount < tags.length) {
                // Ensure at least 1 remains visible if we have any
                while (finalCount > 1 && (currentWidth + gap + badgeWidth > containerWidth)) {
                    const lastChildWidth = children[finalCount - 1].offsetWidth;
                    currentWidth -= (lastChildWidth + (finalCount > 1 ? gap : 0));
                    finalCount--;
                }
            }

            if (displayCount !== finalCount) {
                setDisplayCount(finalCount);
            }
        };

        const observer = new ResizeObserver(updateCount);
        if (containerRef.current) observer.observe(containerRef.current);
        updateCount();

        return () => observer.disconnect();
    }, [tags.length, displayCount, maxTagWidth]);

    const overflowCount = tags.length - displayCount;

    return (
        <div ref={containerRef} className="flex-1 min-w-0 relative h-6 overflow-hidden w-full">
            {/* REAL DISPLAY: Shows only fitting tags */}
            <div className="flex flex-nowrap items-center gap-1.5 h-full min-w-0">
                {tags.slice(0, displayCount).map((tag, i) => (
                    <span
                        key={`${tag}-${i}`}
                        className="inline-flex items-center leading-none text-[10px] px-1.5 py-0.5 rounded-sm bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 font-medium border border-transparent whitespace-nowrap truncate flex-shrink-0"
                        style={{ maxWidth: `${maxTagWidth}px` }}
                        title={tag}
                    >
                        {tag}
                    </span>
                ))}
                {overflowCount > 0 && (
                    <span
                        className="inline-flex items-center leading-none text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-bold cursor-default whitespace-nowrap flex-shrink-0"
                        title={tags.slice(displayCount).join(', ')}
                    >
                        +{overflowCount}
                    </span>
                )}
                {tags.length === 0 && (
                    <span className="text-xs text-text-muted italic opacity-50">No Tags</span>
                )}
            </div>

            {/* MEASUREMENT BUFFER: Hidden but always in flow for accurate counting */}
            <div
                ref={measureRef}
                className="absolute opacity-0 pointer-events-none flex flex-nowrap items-center gap-1.5"
                style={{ visibility: 'hidden', top: -1000, left: 0 }}
            >
                {tags.map((tag, i) => (
                    <span
                        key={`measure-${tag}-${i}`}
                        className="dtl-tag-measure inline-flex items-center leading-none text-[10px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap flex-shrink-0"
                        style={{ maxWidth: `${maxTagWidth}px` }}
                    >
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    );
}
