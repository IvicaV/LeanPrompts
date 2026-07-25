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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, StickyNote, History, Copy, Check, Save, ChevronLeft, ChevronRight, AlertTriangle, Plus, ExternalLink
} from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard';
import { triggerInjection } from '../../../utils/injectionAPI';
import { getLlmConfig, getInjectionTooltip } from '../../../utils/llmConstants';
import useModifierKeys from '../../../hooks/useModifierKeys';
import { LlmInjectLabel, LlmIconButton } from '../../../components/llm/LlmInjectBar';

// COMPONENTS
import VariableInspector from '../../../components/VariableInspector';
import NoteEditor from '../../../components/NoteEditor';
import VersionHistory from '../../../components/VersionHistory';

export default function InspectorPanel({
  activePresetName = null,
  isCollapsed,
  onToggleCollapse,
  activeTab,
  onTabChange,
  activeStepId,
  detectedVariables,
  snippetVariables,
  variableValues,
  onVariableChange,
  currentStepFiles,
  onFilesChange,
  onClearSession,
  activeStepContent,
  llms,
  localEditorContent,
  resolvedEditorContent,
  fullResolvedContent = "",
  snippets,
  activePrompt,
  toggleVariableIgnore,
  currentStepNote,
  handleResetNoteRequest,
  currentHistoryVersions,
  onNotification,
  getPreviewForStep,
  onRestoreVersion,
  onManualSnapshot,
  isSaving,
  // NEW: For presets
  onSavePreset,
  onDeletePreset,
  onLoadPreset,
  onRenamePreset,
  // NEW: For internal linking in Notes
  prompts = [],
  knowledgeTiles = [],
  onNoteNavigate = null,
  onConfirmAction = null
}) {
  const [isCopied, setIsCopied] = React.useState(false);
  const [scrollPosition, setScrollPosition] = React.useState({ left: false, right: false });
  const llmScrollRef = React.useRef(null);

  const handleCopyCompiled = async () => {
    const compiled = getPreviewForStep(activeStepContent);
    await copyToClipboard(compiled);
    setIsCopied(true);
    onNotification("Compiled prompt copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const updateScrollButtons = React.useCallback(() => {
    if (llmScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = llmScrollRef.current;
      setScrollPosition({
        left: scrollLeft > 10,
        right: scrollLeft + clientWidth < scrollWidth - 10
      });
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(updateScrollButtons, 500);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [llms, updateScrollButtons]);

  const handleLaunch = async (llm, e) => {
    // MODIFIER LOGIC
    const isShift = e.shiftKey;
    const isNewChat = e.ctrlKey || e.metaKey;

    // --- ZERO-REGRESSION: REQUIRED VARIABLE GATEKEEPER ---
    if (!isShift) {
      const missingReq = (detectedVariables || []).filter(v => {
        if (!v.startsWith('!')) return false;
        if (activePrompt?.ignoredVariables?.includes(v)) return false;

        const isFile = v.toLowerCase().startsWith('!file:');

        // ZERO-REGRESSION FIX: Lese immer unter dem sauberen Key (ohne !)
        const cleanV = v.replace(/^!/, '').replace(/^!file:/i, 'file:');
        const userVal = variableValues[cleanV] !== undefined ? variableValues[cleanV] : variableValues[v];

        // 1. Check Files
        if (isFile) return !userVal || !Array.isArray(userVal) || userVal.length === 0;

        // 2. Check Text Input
        if (userVal !== undefined && String(userVal).trim() !== "") return false;

        // 3. Check Default Template Value (Safe Regex)
        try {
          const escapedV = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\{\\{\\s*${escapedV}\\s*:([^}]+)\\}\\}`, 'i');
          const match = (fullResolvedContent || resolvedEditorContent || "").match(regex);
          if (match && match[1] && match[1].trim() !== "") return false;
        } catch(e) {}

        return true; // Variable is empty and has no default -> MISSING!
      });

      if (missingReq.length > 0) {
        const names = missingReq.map(v => v.replace(/^!file:/i, '').replace(/^!/, ''));

        // 1. Show visual warning
        if (onNotification) onNotification(`Required fields missing: ${names.join(', ')}`, 'error');

        // 2. Switch to the vars tab immediately if the user is on Notes or History
        if (activeTab !== 'vars' && onTabChange) onTabChange('vars');

        // 3. Pulse the missing fields amber
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('lp-highlight-variables', {
            detail: { names: missingReq, theme: 'amber' }
          }));
        }, 50);

        // 🛑 ABSOLUTE HARD STOP
        return;
      }
    }
    // -----------------------------------------------------

    // Configuration Resolution
    const config = getLlmConfig(llm);
    const targetUrl = isNewChat ? config.newChatUrl : config.url;

    // If Shift is pressed, we don't send any data (Open Only Mode)
    const text = isShift ? null : getPreviewForStep(activeStepContent);

    let filesToUse = [];
    if (!isShift) {
      filesToUse = [...(currentStepFiles || [])];

      // ZERO-REGRESSION FIX: Normalisiere Keys vor dem Vergleich
      if (variableValues) {
        const cleanDetectedVars = (detectedVariables || []).map(v => v.replace(/^!/, '').replace(/^!file:/i, 'file:'));

        Object.keys(variableValues).forEach(key => {
          const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
          if (cleanKey.startsWith('file:') && cleanDetectedVars.includes(cleanKey)) {
            const varFiles = variableValues[key];
            if (Array.isArray(varFiles)) {
              filesToUse.push(...varFiles);
            } else if (varFiles) {
              filesToUse.push(varFiles);
            }
          }
        });
      }

      // Deduplicate files by name and size
      filesToUse = filesToUse.filter((file, index, self) =>
        index === self.findIndex(f => f.name === file.name && f.size === file.size)
      );
    }

    const ghostFiles = filesToUse.filter(f => f.isGhost || (!f.data && !(f instanceof Blob)));

    const executeLaunch = async () => {
      if (onNotification) {
        if (isNewChat) {
          onNotification(`Starting new chat in ${llm.name}...`, 'info');
        } else {
          onNotification(isShift ? `Opening ${llm.name}...` : `Launching ${llm.name}...`, 'info');
        }
      }

      let processedFiles = [];
      if (filesToUse && filesToUse.length > 0) {
        try {
          processedFiles = await Promise.all(
            filesToUse
              .filter(f => !f.isGhost || (f.isGhost && f.data)) // Skip ghost files without data
              .map(f => new Promise((resolve, reject) => {
                // Case A: Pre-processed Base64 (from presets or VariableInspector)
                if (f.data && typeof f.data === 'string') {
                  return resolve({
                    name: f.name,
                    type: f.type,
                    data: f.data
                  });
                }
                // Case B: Raw File object
                if (f instanceof Blob) {
                  const reader = new FileReader();
                  reader.onload = () => resolve({
                    name: f.name,
                    type: f.type,
                    data: reader.result
                  });
                  reader.onerror = reject;
                  reader.readAsDataURL(f);
                } else {
                  // Should not happen, but prevents crash
                  resolve(null);
                }
              }))
          );
          processedFiles = processedFiles.filter(Boolean);
        } catch (e) {
          console.error("Inspector Injection Error:", e);
          if (onNotification) onNotification("Failed to process files for injection.", 'error');
          return;
        }
      }

      /* @PROTECTED_REGION START: INSPECTOR_INJECTION_TRIGGER
         CRITICAL: Use ONLY injectionAPI. */
      triggerInjection({
        url: targetUrl,
        text: text,
        files: processedFiles,
        forceNavigate: isNewChat,
        alternativeDomains: llm.alternativeDomains || config.alternativeDomains
      }, (resp) => {
        if (resp && resp.success) {
          if (resp.status === "opened") {
            // Open only success - maybe distinct notification if needed, but "Opening..." above covers it.
          } else if (onNotification) {
            onNotification(`${llm.name} injected successfully!`);
          }
        } else if (resp && resp.error) {
          if (onNotification) onNotification(resp.error, 'error');
        }
      });
      /* @PROTECTED_REGION END: INSPECTOR_INJECTION_TRIGGER */
    };

    if (ghostFiles.length > 0 && !isShift) {
        if (onNotification) {
            onNotification(`Skipped ${ghostFiles.length} missing file(s)`, 'warning');
        }
    }

    executeLaunch();
  };

  const handleWheelScroll = (e) => {
    if (llmScrollRef.current) {
      llmScrollRef.current.scrollLeft += e.deltaY;
      updateScrollButtons();
    }
  };

  const scrollLlmBar = (direction) => {
    if (llmScrollRef.current) {
      const amount = direction === 'left' ? -80 : 80;
      llmScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(updateScrollButtons, 350);
    }
  };

  return (
    <motion.div
      id="dash-inspector"
      initial={false}
      animate={{ width: isCollapsed ? 0 : 320 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="bg-bg-surface flex-shrink-0 flex flex-col border-l border-border z-10 shadow-2xl relative overflow-hidden"
    >
      {/* 1. TAB NAVIGATION */}
      <div className="flex border-b border-border bg-bg-surface select-none overflow-x-auto no-scrollbar">
        <TabButton
          icon={<Sparkles size={14} />}
          label="Variables"
          active={activeTab === 'vars'}
          onClick={() => onTabChange('vars')}
        />
        <TabButton
          icon={<StickyNote size={14} />}
          label="Notes"
          active={activeTab === 'notes'}
          onClick={() => onTabChange('notes')}
          hasIndicator={Boolean(currentStepNote?.trim())}
        />
        <TabButton
          icon={<History size={14} />}
          label="History"
          active={activeTab === 'history'}
          onClick={() => onTabChange('history')}
        />
      </div>

      {/* 2. TAB CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative bg-bg">
        {activeTab === 'vars' ? (
          <VariableInspector
            key={`${activePrompt.id}-${activeStepId || 'global'}`}
            variables={detectedVariables}
            snippetVariables={snippetVariables}
            values={variableValues}
            onChange={onVariableChange}
            files={currentStepFiles}
            onFilesChange={onFilesChange}
            onClear={onClearSession}
            content={activeStepContent}
            llms={llms}
            rawContent={fullResolvedContent || resolvedEditorContent || localEditorContent}
            snippets={snippets}
            ignoredVariables={activePrompt.ignoredVariables}
            onToggleIgnore={(varName) => toggleVariableIgnore(activePrompt.id, varName)}
            onNotification={onNotification}
            presets={activePrompt.presets}
            onSavePreset={onSavePreset}
            onDeletePreset={onDeletePreset}
            onLoadPreset={onLoadPreset}
            onRenamePreset={onRenamePreset}
            activePresetName={activePresetName}
          />
        ) : activeTab === 'notes' ? (
          <NoteEditor
            key={activeStepId}
            promptId={activePrompt.id}
            stepId={activeStepId || activePrompt.chain[0].id}
            initialValue={currentStepNote}
            onResetRequest={handleResetNoteRequest}
            prompts={prompts}
            snippets={snippets}
            knowledgeTiles={knowledgeTiles}
            onNavigate={onNoteNavigate}
          />
        ) : (
          <div className="animate-fade-in h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <VersionHistory
                prompt={activePrompt}
                versions={currentHistoryVersions}
                currentContent={activeStepContent}
                onRestore={onRestoreVersion}
                onManualSnapshot={() => onManualSnapshot(activeStepId)}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. PERSISTENT FOOTER */}
      {!isCollapsed && (
        <div className="bg-bg-surface border-t border-border mt-auto shadow-[-1px_-5px_20px_rgba(0,0,0,0.2)]">
          {/* LLM Direct Inject */}
          {llms && llms.length > 0 && (
            <div className="border-b border-border/40 group/llmbar">
              <LlmInjectLabel context="inspector" />
              <div className="relative group/llmbar mb-3">
                {/* Scroll Buttons - Bounded Design (Popup Parity) */}
                <AnimatePresence>
                  {scrollPosition.left && (
                    <motion.button
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onClick={() => scrollLlmBar('left')}
                      className="absolute left-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.8)] text-text-faint hover:text-primary transition-all cursor-pointer"
                    >
                      <ChevronLeft size={16} strokeWidth={2.5} />
                    </motion.button>
                  )}
                  {scrollPosition.right && (
                    <motion.button
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      onClick={() => scrollLlmBar('right')}
                      className="absolute right-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.8)] text-text-faint hover:text-primary transition-all cursor-pointer"
                    >
                      <ChevronRight size={16} strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>

                <div
                  id="dash-llm-bar"
                  className="flex items-center gap-1.5 px-1 overflow-x-auto no-scrollbar custom-scrollbar w-full h-10"
                  style={{
                    maskImage: scrollPosition.right
                      ? 'linear-gradient(to right, black 85%, transparent 100%)'
                      : scrollPosition.left
                        ? 'linear-gradient(to left, black 85%, transparent 100%)'
                        : 'none'
                  }}
                  ref={llmScrollRef}
                  onWheel={handleWheelScroll}
                  onScroll={updateScrollButtons}
                >
                  {llms.map(llm => (
                    <LlmIconButton
                        key={llm.id}
                        size="md"
                        llm={llm}
                        onClick={(e) => handleLaunch(llm, e)}
                        tooltip={getInjectionTooltip(llm.name, `Step ${(activePrompt?.chain?.findIndex(s => s.id === activeStepId) || 0) + 1}`)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Copy Button */}
          <div className="p-4">
            <button
              onClick={handleCopyCompiled}
              title="Copies the final prompt to your clipboard with all variables filled, snippets resolved, and internal comments removed."
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all transform active:scale-[0.98] ${isCopied
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/25 border border-transparent'
                }`}
            >
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
              {isCopied ? "Copied!" : "Copy Compiled"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * INTERNAL HELPER: TabButton
 */
function TabButton({ icon, label, active, onClick, hasIndicator }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 min-w-[80px] py-4 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${active
        ? 'border-primary text-primary bg-bg-surface'
        : 'border-transparent text-text-muted hover:text-text-main hover:bg-bg-hover'
        }`}
    >
      <div className="relative inline-flex">
        {icon}
        {hasIndicator && (
          <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_rgba(99,102,241,0.5)]"></span>
        )}
      </div>
      <span>{label}</span>
    </button>
  );
}


