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
import React from 'react'
import ReactDOM from 'react-dom/client'
import Dashboard from './Dashboard'
import '../../styles/globals.css'

// Inline Theme-Prüfung zur Vermeidung von Shared Chunks und FOUC
try {
  const storedTheme = localStorage.getItem('theme');
  const isDark = storedTheme 
    ? storedTheme === 'dark' 
    : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
  document.documentElement.style.backgroundColor = isDark ? '#09090b' : '#ffffff';
} catch (e) {
  document.documentElement.classList.add('dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
)