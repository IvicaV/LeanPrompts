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
/**
 * COLLECTION COLOR UTILITIES
 * Provides a curated palette and tinting functions for collection-based card coloring.
 * Dark-mode optimized: all colors are applied at configurable opacity to maintain
 * text readability and the premium dark aesthetic.
 */

// 10 curated colors – maximally distinct at low opacity on dark backgrounds
export const COLLECTION_COLOR_PALETTE = [
    { hex: '#f43f5e', label: 'Rose' },
    { hex: '#f97316', label: 'Orange' },
    { hex: '#eab308', label: 'Gold' },
    { hex: '#22c55e', label: 'Green' },
    { hex: '#06b6d4', label: 'Cyan' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#6366f1', label: 'Indigo' },
    { hex: '#8b5cf6', label: 'Violet' },
    { hex: '#d946ef', label: 'Fuchsia' },
    { hex: '#a1a1aa', label: 'Zinc' },
];

// Sentinel value: when set, disables color-coding for a collection
export const DISABLED_COLOR = 'none';

// Default opacity (0-1 range, as stored in DB)
export const DEFAULT_OPACITY = 0.08;

// Slider bounds
export const MIN_OPACITY = 0.02;
export const MAX_OPACITY = 0.18;

/**
 * Parse a hex color to RGB components.
 * @param {string} hex – e.g. '#f43f5e'
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
    const cleaned = hex.replace('#', '');
    return {
        r: parseInt(cleaned.substring(0, 2), 16),
        g: parseInt(cleaned.substring(2, 4), 16),
        b: parseInt(cleaned.substring(4, 6), 16),
    };
}

/**
 * Returns an inline style object for collection-tinted cards.
 *
 * - Regular cards: gradient background + thin left border
 * - Pinned cards: only the thin left border (amber gradient takes precedence)
 * - Disabled/no color: returns empty object
 *
 * @param {string|null} hexColor – collection color hex, or 'none'/null
 * @param {boolean} isPinned – whether the card is pinned
 * @param {number} opacity – tint intensity (0-1), default 0.08
 * @returns {object} React inline style object
 */
export function getCollectionTintStyle(hexColor, isPinned = false, opacity = DEFAULT_OPACITY) {
    if (!hexColor || hexColor === DISABLED_COLOR) return {};

    const { r, g, b } = hexToRgb(hexColor);
    const bgHigh = opacity;          // gradient start
    const bgLow = opacity * 0.35;    // gradient end (fades out)
    const borderAlpha = Math.min(opacity * 2.5, 0.35); // border is bolder than bg

    if (isPinned) {
        // Pinned: only a thin colored left-border accent (amber bg stays)
        return {
            borderLeft: `2px solid rgba(${r}, ${g}, ${b}, ${borderAlpha})`,
        };
    }

    // Regular: watercolor background wash + thin left accent
    return {
        background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, ${bgHigh}) 0%, rgba(${r}, ${g}, ${b}, ${bgLow}) 100%)`,
        borderLeft: `2px solid rgba(${r}, ${g}, ${b}, ${borderAlpha})`,
    };
}

/**
 * Returns an inline style for list-view table rows.
 *
 * @param {string|null} hexColor – collection color hex, or 'none'/null
 * @param {number} opacity – tint intensity (0-1), default 0.08
 * @returns {object} React inline style object
 */
export function getCollectionListRowStyle(hexColor, opacity = DEFAULT_OPACITY) {
    if (!hexColor || hexColor === DISABLED_COLOR) return {};

    const { r, g, b } = hexToRgb(hexColor);
    const borderAlpha = Math.min(opacity * 3, 0.4);

    return {
        borderLeft: `3px solid rgba(${r}, ${g}, ${b}, ${borderAlpha})`,
        background: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${opacity * 0.7}) 0%, transparent 40%)`,
    };
}
