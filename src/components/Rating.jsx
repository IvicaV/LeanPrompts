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
import React, { useState } from 'react';
import { Star } from 'lucide-react';

export default function Rating({ value = 0, onChange, size = 16, interactive = true }) {
    const [hoverValue, setHoverValue] = useState(0);

    const displayValue = hoverValue || value;

    return (
        <div className={`flex items-center gap-0.5 ${interactive ? 'cursor-pointer' : ''}`}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={!interactive}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onChange) onChange(star === value ? 0 : star);
                    }}
                    onMouseEnter={() => interactive && setHoverValue(star)}
                    onMouseLeave={() => interactive && setHoverValue(0)}
                    className={`transition-all duration-200 ${interactive ? 'hover:scale-110 active:scale-90' : ''
                        } ${star <= displayValue
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-text-muted/30 fill-transparent'
                        }`}
                >
                    <Star size={size} strokeWidth={star <= displayValue ? 2 : 1.5} />
                </button>
            ))}
        </div>
    );
}
