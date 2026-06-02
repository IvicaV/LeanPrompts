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
import React, { useRef, useState } from 'react';
import { X, Download, Share2, FileJson, Image as ImageIcon, FileText, CheckSquare, Square, Terminal } from 'lucide-react';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { resolveSnippets } from '../utils/variableParser';
import useBodyLock from '../hooks/useBodyLock';
export default function ShareModal({ isOpen, onClose, prompt, snippets, initialStepId }) {
  useBodyLock();
  const ref = useRef(null);
  const stepsScrollRef = useRef(null);
  const [isExportingImg, setIsExportingImg] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  // Fix: Non-passive wheel listener, um zu verhindern, dass der Parent-Container mitscrollt
  React.useEffect(() => {
    const container = stepsScrollRef.current;
    if (!container) return;
    const handleNativeWheel = (e) => {
      // Prüfen, ob wir überhaupt noch scrollen können
      const isScrollable = container.scrollWidth > container.clientWidth;
      if (isScrollable) {
        // ZERO-REGRESSION: Kapert Event NUR bei primär vertikaler Bewegung (Rad). Lässt Trackpad (horizontal) intakt.
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault(); // Blockiert das vertikale Scrollen des Hintergrunds
          container.scrollLeft += e.deltaY;
        }
      }
    };
    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isOpen, prompt?.chain?.length]);
  // Selektive Step-Auswahl
  const [selectedStepIds, setSelectedStepIds] = useState(new Set());
  // Effekt zum Synchronisieren der Auswahl, wenn das Modal geöffnet wird oder der Prompt sich ändert
  React.useEffect(() => {
    if (!prompt) return;
    if (initialStepId) {
      setSelectedStepIds(new Set([initialStepId]));
    } else {
      setSelectedStepIds(new Set(prompt.chain?.map(s => s.id) || []));
    }
  }, [prompt?.id, initialStepId, isOpen]);
  const toggleStep = (id) => {
    const newSet = new Set(selectedStepIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStepIds(newSet);
  };
  const allSelected = prompt?.chain && selectedStepIds.size === prompt.chain.length;
  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedStepIds(new Set());
    } else {
      setSelectedStepIds(new Set(prompt.chain?.map(s => s.id) || []));
    }
  };
  const displayChain = React.useMemo(() => {
    if (!prompt?.chain) return [];
    return prompt.chain.filter(s => selectedStepIds.has(s.id));
  }, [prompt?.chain, selectedStepIds]);
  // SMART DETECTOR: Prüft, ob die globalen oder die aktuell AUSGEWÄHLTEN Steps eine Historie haben
  const hasHistory = React.useMemo(() => {
    if (!prompt) return false;
    const stepsHaveHistory = displayChain.some(step => step.versions && step.versions.length > 0);
    const globalHasHistory = prompt.versions && prompt.versions.length > 0;
    return stepsHaveHistory || globalHasHistory;
  }, [prompt, displayChain]);
  // Sicherheits-Reset, falls der Nutzer Steps an/abwählt und plötzlich keine Historie mehr existiert
  React.useEffect(() => {
    if (!hasHistory) setIncludeHistory(false);
  }, [hasHistory]);
  if (!isOpen || !prompt) return null;
  const handleDownloadImage = async () => {
    if (ref.current === null) return;
    setIsExportingImg(true);
    try {
      // Timeout protection: Prevent infinite "Rendering..." on canvas limits
      const renderPromise = toPng(ref.current, { cacheBust: true, pixelRatio: 2 });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("CANVAS_TIMEOUT")), 15000)
      );
      const dataUrl = await Promise.race([renderPromise, timeoutPromise]);
      const safeTitle = prompt.title.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
      download(dataUrl, `leanprompts-${safeTitle}.png`);
    } catch (err) {
      console.error('Image export failed', err);
      alert(err.message === "CANVAS_TIMEOUT"
        ? "This prompt is too long to render as an image. Please use the JSON export instead."
        : "Image export failed. Please try again.");
    } finally {
      setIsExportingImg(false);
    }
  };
  const handleDownloadJson = () => {
    setIsExportingJson(true);
    try {
      const promptToExport = { ...prompt };
      // Filtern der Steps basierend auf der Auswahl
      if (promptToExport.chain) {
        promptToExport.chain = promptToExport.chain.filter(step => selectedStepIds.has(step.id));
      }
      // Falls die Historie nicht gewünscht ist, strippen wir sie aus dem Export
      if (!includeHistory) {
        promptToExport.versions = [];
        if (promptToExport.chain) {
          promptToExport.chain = promptToExport.chain.map(step => ({
            ...step,
            versions: []
          }));
        }
      }
      const exportData = {
        meta: {
          version: 2, // Erhöht auf 2 für Smart-Import Support (Notes/Steps)
          type: 'single_export',
          exportedAt: new Date().toISOString(),
          app: "LeanPrompts"
        },
        data: [promptToExport]
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const safeTitleJson = prompt.title.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
      const fileName = `leanprompts-${safeTitleJson}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('JSON export failed', err);
    } finally {
      setIsExportingJson(false);
    }
  };
  // Hilfsfunktion zum Highlighting von Variablen in der Bild-Vorschau
  const renderHighlightedContent = (text) => {
    if (!text) return null;
    // Regex matches {{Variable}}, [[Variable]], and <XML_Tags>
    const parts = text.split(/(\{\{.*?\}\}|\[\[.*?\]\]|<[^>]+>)/g);
    return parts.map((part, i) => {
      const isVar = (part.startsWith('{{') && part.endsWith('}}')) || (part.startsWith('[[') && part.endsWith(']]'));
      const isTag = part.startsWith('<') && part.endsWith('>');
      if (isVar) {
        return (
          <span key={i} style={{ color: '#34d399', fontWeight: 'bold' }}>
            {part}
          </span>
        );
      }
      if (isTag) {
        return (
          <span key={i} style={{ color: '#34e0a1', fontWeight: 'bold', fontStyle: 'italic' }}>
            {part}
          </span>
        );
      }
      return part;
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden max-w-4xl w-full flex flex-col max-h-[90vh] dm-modal">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-bg-surface">
          <h3 className="font-bold text-text-main flex items-center gap-2">
            <Download size={18} className="text-primary" />
            Export Prompt
          </h3>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-text-main rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0a0a0a] flex flex-col items-center gap-6">
          {/* STEP SELECTION (Nur wenn Chain vorhanden) */}
          {prompt?.chain && prompt.chain.length > 1 && (
            <div className="flex flex-col items-center gap-2 w-full max-w-full px-4">
              <div className="bg-bg-elevated p-1 rounded-2xl border border-white/5 flex items-center shadow-2xl max-w-full overflow-hidden">
                <div 
                  ref={stepsScrollRef}
                  className="flex items-center gap-1 p-1 bg-black/20 rounded-xl overflow-x-auto custom-scrollbar flex-1 min-w-0"
                >
                  {prompt.chain.map((step, idx) => (
                    <button
                      key={step.id}
                      onClick={() => toggleStep(step.id)}
                      className={`min-w-[44px] shrink-0 h-9 px-3 rounded-lg text-[11px] font-mono font-bold transition-all flex flex-col items-center justify-center ${selectedStepIds.has(step.id)
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'text-text-muted hover:text-text-main hover:bg-white/5'
                        }`}
                    >
                      <span className="opacity-50 text-[8px] uppercase tracking-tighter mb-0.5">Step</span>
                      {idx + 1}
                    </button>
                  ))}
                </div>
                <div className="w-px h-6 bg-white/10 mx-2 shrink-0"></div>
                <button
                  onClick={handleToggleAll}
                  className={`px-4 py-2 rounded-xl shrink-0 text-[10px] font-bold uppercase tracking-widest transition-all ${allSelected
                    ? 'text-primary hover:text-primary-hover'
                    : 'text-text-muted hover:text-text-main'
                    }`}
                >
                  {allSelected ? 'None' : 'All'}
                </button>
              </div>
              <span className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium">Select steps to export</span>
            </div>
          )}
          {/* --- DAS BILD (EXPORT BEREICH) --- */}
          <div
            ref={ref}
            className="w-full max-w-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 p-12 rounded-xl relative border border-white/5 shadow-2xl"
          >
            {/* Das "Fenster" */}
            <div className="bg-[#18181b] rounded-lg shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/50">
              {/* 1. TITLE BAR (Neutral / Tech) */}
              <div className="h-10 bg-[#27272a] border-b border-white/5 flex items-center justify-between px-4">
                {/* Links: Icon & Titel */}
                <div className="flex items-center gap-2.5 opacity-70">
                  <Terminal size={14} className="text-white/60" />
                  <span className="text-xs font-mono text-white/80 tracking-wide pt-0.5">
                    {prompt?.title}
                  </span>
                </div>
                {/* Rechts: Fake Controls (Windows/Linux Style - sehr subtil) */}
                <div className="flex gap-2 opacity-30">
                  <div className="w-2.5 h-0.5 bg-white rounded-full"></div> {/* Minimize */}
                  <div className="w-2.5 h-2.5 border border-white rounded-[2px]"></div> {/* Maximize */}
                  <div className="w-2.5 h-2.5 relative"> {/* Close X */}
                    <div className="absolute inset-0 rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                    <div className="absolute inset-0 -rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                  </div>
                </div>
              </div>
              {/* 2. CONTENT */}
              <div className="p-8 bg-[#18181b] space-y-8 transition-all duration-300">
                {displayChain.length > 0 ? (
                  displayChain.map((step, index) => {
                    // Find global index in origin chain
                    const originalIdx = prompt.chain ? prompt.chain.findIndex(s => s.id === step.id) : 0;
                    return (
                      <div key={step.id} className="space-y-3 animate-slide-in">
                        {/* Step Header */}
                        <div className="flex items-center gap-3 opacity-50">
                          <div className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-white/20 rounded text-white/60">
                            Step {originalIdx + 1}
                          </div>
                          {step.title && (
                            <span className="text-[11px] font-bold text-white/80 truncate">
                              {step.title}
                            </span>
                          )}
                          <div className="flex-1 h-px bg-white/5"></div>
                        </div>
                        {/* Step Content */}
                        <pre className="font-mono text-[13px] text-[#e4e4e7] leading-7 whitespace-pre-wrap break-words">
                          {renderHighlightedContent(resolveSnippets(step.content, snippets))}
                        </pre>
                      </div>
                    );
                  })
                ) : (
                  <pre className="font-mono text-[13px] text-[#e4e4e7] leading-7 whitespace-pre-wrap break-words">
                    {renderHighlightedContent(resolveSnippets(prompt.content, snippets))}
                  </pre>
                )}
              </div>
              {/* 3. STATUS BAR (Branding) */}
              {/* Footer: Vertikal absolut kompakt (Leading-None) */}
              <div className="py-2.5 px-6 border-t border-white/[0.05] bg-[#1a1d24] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      {/* Logo: 20px, zentriert auf die Gesamthöhe des Textblocks */}
                      <div className="w-5 h-5 rounded overflow-hidden shrink-0">
                          <img src="/icon48.png" alt="Logo" className="w-full h-full object-cover" />
                      </div>
                      
                      {/* Claim & Name: Leading-none sorgt dafür, dass kein Abstand zwischen den Zeilen entsteht */}
                      <div className="flex flex-col justify-center leading-none">
                          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest">
                              <span className="text-gray-500 font-semibold">ENGINEERED WITH</span>
                              <span className="text-gray-100 font-bold tracking-wide">LEANPROMPTS STUDIO</span>
                          </div>
                          <span className="text-[8px] font-medium text-gray-500 uppercase tracking-[0.2em] mt-[2px]">
                              THE LOCAL AI IDE
                          </span>
                      </div>
                  </div>

                  {/* Zeichenanzahl: Rechtsbündig, vertikal zentriert */}
                  <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest font-bold flex items-center gap-2">
                      <span>
                          {displayChain.length > 0
                              ? displayChain.reduce((acc, s) => acc + (s.content?.length || 0), 0)
                              : (prompt?.content?.length || 0)
                          } CHARACTERS
                      </span>
                      <span className="text-gray-700 font-bold opacity-50">|</span>
                      <span>LOCAL EXECUTION</span>
                  </div>
              </div>
            </div>
          </div>
          {/* --- ENDE BILD --- */}
        </div>
        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-bg-surface flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Checkbox (Intelligent) */}
          <div
            className={`flex items-center gap-3 select-none px-2 transition-colors ${hasHistory ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'}`}
            onClick={() => hasHistory && setIncludeHistory(!includeHistory)}
          >
            <div className={`transition-colors ${!hasHistory ? 'text-text-faint' : includeHistory ? 'text-primary' : 'text-text-muted group-hover:text-text-main'}`}>
              {includeHistory && hasHistory ? <CheckSquare size={18} /> : <Square size={18} />}
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-medium transition-colors ${!hasHistory ? 'text-text-muted' : includeHistory ? 'text-text-main' : 'text-text-muted group-hover:text-text-main'}`}>
                Include Version History
              </span>
              <span className="text-[10px] text-text-muted">
                {hasHistory 
                  ? <>Only affects <span className="font-bold text-text-faint">JSON Export</span>.</>
                  : "No historical snapshots exist for the selected steps."}
              </span>
            </div>
          </div>
          {/* Buttons */}
          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={handleDownloadJson}
              disabled={isExportingJson}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-main bg-bg-elevated border border-border hover:bg-bg-surface hover:border-text-muted transition-all active:scale-95"
            >
              {isExportingJson ? 'Saving...' : <><FileJson size={18} /> Export JSON</>}
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={isExportingImg}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isExportingImg ? 'Rendering...' : <><ImageIcon size={18} /> Export Image</>}
            </button>
          </div>
        </div>
      </div>
    </div >
  );
}
