/**
 * ============================================================================
 * LeanPrompts Studio - Theme Preload
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * KRITISCH FÜR POINT 6: BLOCKING THEME PRELOADER
 * Dieses Skript läuft synchron im Head, um den Flash of Unstyled Content (FOUC) 
 * zu verhindern. Es berechnet das Theme und setzt die Hintergrundfarben, 
 * noch bevor der Browser den Body zeichnet.
 * ============================================================================
 */
(function () {
  try {
    // 1. Theme bestimmen (Storage -> System Preference -> Default Dark)
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    // Default to 'dark' unless explicitly set to 'light' or system explicitly prefers light
    const theme = storedTheme || (systemPrefersLight ? 'light' : 'dark');
    const isDark = theme === 'dark';

    // 2. Klassen für Tailwind CSS setzen
    // Wir entfernen die jeweils andere Klasse explizit, um Inkonsistenzen zu vermeiden
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }

    // 3. ENGINE-LEVEL FIX GEGEN FLASH
    // Wir setzen die Hintergrundfarbe direkt auf das HTML-Element.
    // Diese Werte entsprechen exakt der globals.css Definition (Zinc 950 / Pure White).
    document.documentElement.style.backgroundColor = isDark ? '#09090b' : '#ffffff';

    // 4. Browser UI Synchronisation (Scrollbars, Form-Elemente)
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

  } catch (e) {
    // Robustheit: Fallback auf Dark Mode bei Fehlern
    document.documentElement.classList.add('dark');
    document.documentElement.style.backgroundColor = '#09090b';
    document.documentElement.style.colorScheme = 'dark';
  }
})();