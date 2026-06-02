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
import React, { useMemo } from 'react';
import * as Diff from 'diff';

// Globaler Cache außerhalb des Komponenten-Lebenszyklus
const diffCache = new Map();

export default function DiffViewer({ oldText, newText }) {
  // Generierung eines allozierungsarmen Cache-Keys
  const cacheKey = useMemo(() => {
    const oLen = oldText ? oldText.length : 0;
    const nLen = newText ? newText.length : 0;
    return `${oLen}_${nLen}_${(oldText || "").slice(0, 20)}>>>${(newText || "").slice(0, 20)}`;
  }, [oldText, newText]);

  const diffs = useMemo(() => {
    if (diffCache.has(cacheKey)) {
      return diffCache.get(cacheKey);
    }

    const computed = Diff.diffWords(oldText || "", newText || "");
    diffCache.set(cacheKey, computed);

    // Cache-Größe begrenzen (LRU), um den Speicherbedarf flach zu halten
    if (diffCache.size > 150) {
      const firstKey = diffCache.keys().next().value;
      diffCache.delete(firstKey);
    }

    return computed;
  }, [oldText, newText, cacheKey]);

  return (
    <div className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap bg-bg-elevated p-3 rounded-md border border-border select-text">
      {diffs.map((part, index) => {
        const color = part.added
          ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400'
          : part.removed
            ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400 line-through'
            : 'text-text-muted';

        return (
          <span key={index} className={`${color} px-0.5 rounded-sm transition-colors`}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
}