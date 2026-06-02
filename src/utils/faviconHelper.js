/**
 * ============================================================================
 * LeanPrompts Studio - Favicon Helper (Zero-Permission Hybrid Edition)
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * Generates offline-safe vector fallback avatars for local domains/IPs
 * to prevent leaking internal hosts to external networks and fix broken icons.
 * Public web domains continue to use the established Google favicon service.
 * ============================================================================
 */

const faviconCache = new Map();

export const getFaviconUrl = (url, name = "A") => {
    if (!url) return 'icon16.png';

    const cacheKey = `${url.trim()}_${name}`;
    if (faviconCache.has(cacheKey)) {
        return faviconCache.get(cacheKey);
    }

    try {
        let cleanUrl = url.trim();
        // Support protocol-less strings defensively
        if (!/^https?:\/\//i.test(cleanUrl)) {
            cleanUrl = `https://${cleanUrl}`;
        }

        const urlObj = new URL(cleanUrl);
        const host = urlObj.hostname.toLowerCase();

        // 1. Detection of localhost, loopback, private IP ranges, and local namespaces (Intranet / Local AI)
        const isLocal = host === 'localhost' || 
                        host === '127.0.0.1' || 
                        host === '0.0.0.0' ||
                        host === '[::1]' ||
                        host.startsWith('192.168.') || 
                        host.startsWith('10.') || 
                        host.startsWith('172.') ||
                        host.endsWith('.local') ||
                        host.endsWith('.lan') ||
                        host.endsWith('.internal') ||
                        !host.includes('.'); // Local hostnames without dot like http://ollama

        let result;
        if (isLocal) {
            const firstLetter = name ? name.trim().charAt(0).toUpperCase() : 'L';
            
            // Ultra-defensive: Base64-encode the SVG to avoid any parser-specific special character bugs
            const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6366f1" fill-opacity="0.1" stroke="#6366f1" stroke-opacity="0.2" stroke-width="1.5"/><text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="bold" font-size="14" fill="#6366f1" text-anchor="middle">${firstLetter}</text></svg>`;
            const base64Svg = btoa(unescape(encodeURIComponent(svgString)));
            result = `data:image/svg+xml;base64,${base64Svg}`;
        } else {
            // 2. Public URLs: Continue using established Google service
            result = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
        }

        faviconCache.set(cacheKey, result);
        return result;
    } catch (e) {
        // Safe structural fallback
        return 'icon16.png';
    }
};
