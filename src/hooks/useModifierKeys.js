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
import { useState, useEffect } from 'react';

export default function useModifierKeys() {
    const [modifiers, setModifiers] = useState({ ctrl: false, shift: false });

    useEffect(() => {
        const handleKeyDown = (e) => {
            const isCtrl = e.key === 'Control' || e.key === 'Meta';
            const isShift = e.key === 'Shift';
            
            if (isCtrl || isShift) {
                // Wir vertrauen hier auf die CSS group-hover Engine in den Komponenten, 
                // um peripheres Flackern zu verhindern. Ein JS Focus-Guard blockiert 
                // hier fälschlicherweise die Interaktion, wenn der Editor noch den Fokus hat.
                setModifiers(prev => {
                    const nextCtrl = isCtrl ? true : prev.ctrl;
                    const nextShift = isShift ? true : prev.shift;
                    // ZERO-REGRESSION GUARD: Verhindert Re-Render-Spam bei gedrückt gehaltener Taste
                    if (prev.ctrl === nextCtrl && prev.shift === nextShift) return prev;
                    return { ctrl: nextCtrl, shift: nextShift };
                });
            }
        };

        const handleKeyUp = (e) => {
            const isCtrl = e.key === 'Control' || e.key === 'Meta';
            const isShift = e.key === 'Shift';

            if (isCtrl || isShift) {
                setModifiers(prev => {
                    const nextCtrl = isCtrl ? false : prev.ctrl;
                    const nextShift = isShift ? false : prev.shift;
                    // ZERO-REGRESSION GUARD
                    if (prev.ctrl === nextCtrl && prev.shift === nextShift) return prev;
                    return { ctrl: nextCtrl, shift: nextShift };
                });
            }
        };

        // Verhindert steckengebliebene Tasten, wenn das Fenster den Fokus verliert (z.B. Alt+Tab)
        const handleBlur = () => setModifiers({ ctrl: false, shift: false });

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    return modifiers;
}
