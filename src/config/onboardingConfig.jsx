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
import { Sparkles, Check, Layers, Settings, Send, FolderOpen, Lock, Tags, Search, Activity, LayoutDashboard, Layout, AlertTriangle } from 'lucide-react';

export const DASHBOARD_TOUR_STEPS = [
  {
    title: "Welcome to LeanPrompts Studio",
    content: "This is your command center. 📌 IMPORTANT: Click the extensions icon (usually a puzzle piece or box) in your browser toolbar and PIN LeanPrompts so you don't lose it!",
    icon: <Sparkles size={20} className="text-primary" />
  },
  {
    target: "#dash-sidebar",
    title: "Structure & Navigation",
    content: "Browse your library, reusable snippets, and knowledge base from the left panel.",
    position: "right",
    icon: <FolderOpen size={20} className="text-blue-500" />
  },
  {
    target: "#dash-library",
    title: "Local-First Library",
    content: "Your prompts are stored 100% locally — zero cloud, zero tracking. Use the folder icon on any prompt to assign it to a Collection.",
    position: "right",
    tip: "Go to Settings > Data Backup regularly to export your workspace as a secure JSON file.",
    icon: <Lock size={20} className="text-slate-500" />
  },
  {
    target: "#dash-meta",
    title: "Metadata & Tags",
    content: "Name your prompt and add tags to make your library instantly searchable. You can also drop a cover image here for quick visual recognition.",
    position: "bottom",
    icon: <Tags size={20} className="text-purple-500" />
  },
  {
    target: "#dash-steps-container",
    title: "Editor & Smart Syntax",
    content: "Break tasks into steps. Type `{{Variable}}` to create text inputs, or `{{file: Document}}` to create dedicated file upload zones.",
    position: "bottom",
    tip: "Type `@` to insert reusable snippets, or use `|` inside variables to create dropdowns (e.g. {{Mode: A|B}}).",
    icon: <Layers size={20} className="text-indigo-500" />
  },
  {
    target: "#dash-inspector",
    title: "The Inspector",
    // UX-POLISH: Wir erklären die Magie (die Verbindung zwischen Editor und Inspector).
    content: "Your control panel. It automatically generates input fields for your variables. You can also load Presets, manage step notes, and access your version history here.",
    position: "left",
    tip: "To add files, click the dropzones, drag & drop, or hover and press Ctrl+V to paste directly from your clipboard.",
    icon: <Settings size={20} className="text-amber-500" />
  },
  {
    target: "#dash-llm-bar",
    title: "Direct Injection",
    content: "Launch your compiled prompt and attachments directly into your target LLM.",
    position: "top",
    tip: "Click to inject. Ctrl+Click opens a fresh chat. Shift+Click opens the LLM without injecting.",
    icon: <Send size={20} className="text-emerald-500" />
  },
  {
    target: "#dash-llm-bar",
    title: "Experience the Magic 🚀",
    content: "Your demo prompt is ready. Click the ChatGPT or Claude icon below. Watch LeanPrompts open a new tab, physically take over the chat, and inject your variables.",
    position: "top", // FIX: Positions the card cleanly above the bar so the icons stay clickable
    icon: <Check size={20} className="text-emerald-500" />
  },
  {
    title: "⚠️ Data Sovereignty: 100% Local",
    content: "LeanPrompts stores your entire library in a secure, offline database inside your browser. No cloud, no tracking, absolute privacy. Please note: Uninstalling the extension or resetting your browser profile will erase this local database. Establish a professional routine and export backups regularly in Settings.",
    icon: <AlertTriangle size={20} className="text-red-500" />
  }
];

export const POPUP_TOUR_STEPS = [
  {
    title: "Quick Access",
    content: "LeanPrompts Studio is running. This popup is your fast-lane for finding and injecting prompts without breaking your flow.",
    icon: <Sparkles size={20} className="text-primary" />
  },
  {
    target: "#popup-status-chip",
    title: "Live Connection Status",
    content: "This indicator tracks your target tab. When it turns green, LeanPrompts is hooked into an active AI interface and ready to inject.",
    position: "bottom",
    tip: "Hover the indicator to briefly highlight the connected text field in your browser.",
    icon: <Activity size={20} className="text-emerald-500" />
  },
  {
    target: "#popup-search-input",
    title: "The Omnibar",
    content: "Search your entire library instantly. If there's no match, this bar doubles as a scratchpad to draft, pin, and save new ideas.",
    position: "bottom",
    tip: "Use the Pin icon to keep your text as a quick draft for later, or save it permanently as a Snippet or Prompt.",
    icon: <Search size={20} className="text-blue-500" />
  },
  {
    target: "#popup-split-btn",
    title: "Native Split-Screen",
    content: "Click here to automatically arrange the LeanPrompts sidebar perfectly next to your active browser window. Zero overlapping, zero Alt-Tabbing.",
    position: "bottom",
    icon: <Layout size={20} className="text-amber-500" />
  },
  {
    target: "#popup-dash-btn",
    title: "The Studio",
    content: "Need to build a complex prompt chain? Open the full IDE dashboard to architect your workflows.",
    position: "bottom",
    tip: "Pro-tip: Press Alt+Shift+L from anywhere in your browser to open the Studio directly.",
    icon: <LayoutDashboard size={20} className="text-purple-500" />
  },
  {
    target: "#popup-llm-bar",
    title: "Direct Injection",
    content: "Click any LLM icon to instantly inject your selected prompt and its variables into the active chat window.",
    position: "top",
    tip: "Pro-tip: Ctrl+Click opens a fresh chat, while Shift+Click just opens the page for you.",
    icon: <Send size={20} className="text-indigo-500" />
  }
];
