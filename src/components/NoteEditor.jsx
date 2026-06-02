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
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StickyNote, Check, FileText, Eraser, ChevronDown, ChevronRight, Info } from 'lucide-react';
import usePromptStore from '../stores/promptStore';
import NoteLinkPicker from './NoteLinkPicker';
import { enableDragSelectScroll } from '../utils/scrollHelper';

export default function NoteEditor({
  promptId,
  stepId,
  initialValue = "",
  onResetRequest,
  prompts = [],
  snippets = [],
  knowledgeTiles = [],
  onNavigate = null,
  onSaveNote = null
}) {
  const { updateStepNote } = usePromptStore();
  const [rawNote, setRawNote] = useState(initialValue); // Stored with IDs
  const [displayValue, setDisplayValue] = useState(''); // Bug 1: Local display state to prevent cursor jumping
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const debounceTimer = useRef(null);
  const textareaRef = useRef(null);
  const linkEditZoneRef = useRef(null); // Bug 2: Track link editing zone to suppress popup

  const [pickerState, setPickerState] = useState({
    isOpen: false,
    trigger: null,
    searchQuery: '',
    position: { top: 0, left: 0 },
    triggerStart: 0
  });

  const prevStepId = useRef(stepId);

  // Transform ID-based links to title-based for display/editing
  const idToTitle = useCallback((text) => {
    if (!text || typeof text !== 'string') return text || "";

    // [[prompt:ID]] -> [[Title]]
    let result = text.replace(/\[\[prompt:([^\]]+)\]\]/g, (match, id) => {
      const prompt = prompts.find(p => p.id === id);
      return prompt ? `[[${prompt.title}]]` : `[[Deleted]]`;
    });

    // [[kb:ID]] -> [[kb:Title]]
    result = result.replace(/\[\[kb:([^\]]+)\]\]/g, (match, id) => {
      const kb = knowledgeTiles.find(t => t.id === id);
      return kb ? `[[kb:${kb.title}]]` : `[[kb:Deleted]]`;
    });

    // @#ID -> @name or @{name}
    result = result.replace(/@#([a-zA-Z0-9-]+)/g, (match, id) => {
      const snippet = snippets.find(s => s.id === id);
      if (!snippet) return `@deleted`;
      const snippetName = String(snippet?.name || 'snippet');
      return snippetName.includes(' ') ? `@{${snippetName}}` : `@${snippetName}`;
    });

    return result;
  }, [prompts, knowledgeTiles, snippets]);

  // Transform title-based links back to ID-based for storage
  const titleToId = useCallback((text) => {
    if (!text || typeof text !== 'string') return text || "";

    // [[kb:Title]] -> [[kb:ID]]
    let result = text.replace(/\[\[kb:([^\]]+)\]\]/g, (match, title) => {
      const kb = knowledgeTiles.find(t => t.title === title.trim());
      return kb ? `[[kb:${kb.id}]]` : match; // Keep original if not found
    });

    // [[Title]] (not kb:) -> [[prompt:ID]]
    result = result.replace(/\[\[(?!kb:)([^\]]+)\]\]/g, (match, title) => {
      const prompt = prompts.find(p => p.title === title.trim());
      return prompt ? `[[prompt:${prompt.id}]]` : match;
    });

    // @{name} -> @#ID
    result = result.replace(/@\{([^\}]+)\}/g, (match, name) => {
      const snippet = snippets.find(s => s.name === name.trim());
      return snippet ? `@#${snippet.id}` : match;
    });

    // @name -> @#ID (but not @#ID which is already ID-based)
    result = result.replace(/@(?!#)(?!\{)([^\s\[\]{}]+)/g, (match, name) => {
      const snippet = snippets.find(s => s.name === name);
      return snippet ? `@#${snippet.id}` : match;
    });

    return result;
  }, [prompts, knowledgeTiles, snippets]);

  // Bug Fix: Initialize displayValue on mount (idToTitle is now available)
  // Without this, displayValue starts as '' and the textarea shows empty when entering edit mode.
  useEffect(() => {
    if (initialValue) setDisplayValue(idToTitle(initialValue));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // If the step changed naturally, ALWAYS sync to prevent showing the wrong step's data.
    if (stepId !== prevStepId.current) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setRawNote(initialValue);
      setDisplayValue(idToTitle(initialValue));
      prevStepId.current = stepId;
      return;
    }

    // Bug Fix: Only apply external store updates if we are not actively typing.
    // This prevents the debounced store update from overwriting the local displayValue 
    // while the user is still typing, which is the root cause of cursor jumps and lost characters.
    if (!isEditing && initialValue !== rawNote) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setRawNote(initialValue);
      setDisplayValue(idToTitle(initialValue));
    }
  }, [stepId, initialValue, isEditing, rawNote, idToTitle]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);



  // Display value (with titles) - used for read-only rendering
  const displayNote = useMemo(() => idToTitle(rawNote), [rawNote, idToTitle]);

  /* @PROTECTED_REGION START: NOTE_CURSOR_STABILITY
     CRITICAL: Prevents cursor from jumping to end during fast typing.
     Uses displayValue (local state) to protect cursor. The useEffect above now 
     correctly ignores delayed external updates while isEditing is true.
     No manual selection range restorer is needed anymore as React handles it natively. */
  /* @PROTECTED_REGION END: NOTE_CURSOR_STABILITY */

  const handleChange = (e) => {
    const displayVal = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Update display value directly. React naturally preserves the cursor natively
    // because we are not mutating e.target.value format synchronously.
    setDisplayValue(displayVal);

    // Convert to ID-based for storage
    const rawVal = titleToId(displayVal);
    setRawNote(rawVal);

    /* @PROTECTED_REGION START: NOTE_LINK_EDIT_ZONE
       CRITICAL: Prevents link picker popup from appearing when editing existing links.
       Uses linkEditZoneRef to remember where a complete link was, so even after the user
       breaks [[...]] by deleting brackets, the popup stays suppressed. Zone clears when
       cursor leaves or [[ is deleted. DO NOT simplify to a single regex check. */
    const insideComplete = isInsideExistingLink(displayVal, cursorPos);
    if (insideComplete) {
      linkEditZoneRef.current = findLinkStart(displayVal, cursorPos);
      if (pickerState.isOpen) {
        setPickerState(prev => ({ ...prev, isOpen: false }));
      }
    } else if (linkEditZoneRef.current != null) {
      const zoneStart = linkEditZoneRef.current;
      const textFromZone = displayVal.slice(zoneStart, zoneStart + 2);
      const isBracket = textFromZone === '[[';
      const isAt = displayVal.charAt(zoneStart) === '@';
      if (cursorPos > zoneStart && (isBracket || isAt)) {
        if (pickerState.isOpen) {
          setPickerState(prev => ({ ...prev, isOpen: false }));
        }
      } else {
        linkEditZoneRef.current = null;
        detectTrigger(displayVal, cursorPos);
      }
    } else {
      detectTrigger(displayVal, cursorPos);
    }
    /* @PROTECTED_REGION END: NOTE_LINK_EDIT_ZONE */

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setIsSaving(true);
      if (onSaveNote) {
        onSaveNote(rawVal);
      } else {
        updateStepNote(promptId, stepId, rawVal);
      }
      setTimeout(() => setIsSaving(false), 800);
    }, 500);
  };

  // Bug 2: Detect if cursor is inside an existing complete link
  const isInsideExistingLink = useCallback((text, cursorPos) => {
    const linkRegex = /\[\[[^\]]+\]\]|@\{[^\}]+\}|@[^\s\[\]{}]+/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      // Include cursor at start position (>=) to catch editing at the opening [[
      if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
        return true;
      }
    }
    return false;
  }, []);

  // Bug 2: Find the start index of the link containing the cursor
  const findLinkStart = useCallback((text, cursorPos) => {
    const linkRegex = /\[\[[^\]]+\]\]|@\{[^\}]+\}|@[^\s\[\]{}]+/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
        return match.index;
      }
    }
    return null;
  }, []);

  const detectTrigger = useCallback((text, cursorPos) => {
    const textBeforeCursor = text.slice(0, cursorPos);

    const bracketMatch = textBeforeCursor.match(/\[\[(?![^\]]*\]\])([^\]]*)$/);
    if (bracketMatch) {
      const triggerStart = cursorPos - bracketMatch[0].length;
      openPicker('[[', bracketMatch[1] || '', triggerStart);
      return;
    }

    const atBracketMatch = textBeforeCursor.match(/@\{(?![^\}]*\})([^\}]*)$/);
    if (atBracketMatch) {
      const triggerStart = cursorPos - atBracketMatch[0].length;
      openPicker('@', atBracketMatch[1] || '', triggerStart);
      return;
    }

    const atMatch = textBeforeCursor.match(/(?:^|\s)@(?!\S+\s)(?!\{)([^\s\[\]{}]*)$/);
    if (atMatch) {
      const triggerStart = cursorPos - atMatch[0].length + (atMatch[0][0] === ' ' || atMatch[0][0] === '\n' ? 1 : 0);
      openPicker('@', atMatch[1] || '', triggerStart);
      return;
    }

    if (pickerState.isOpen) {
      setPickerState(prev => ({ ...prev, isOpen: false }));
    }
  }, [pickerState.isOpen]);

  const openPicker = (trigger, searchQuery, triggerStart) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();
    const lineHeight = 20;
    const lines = displayValue.slice(0, triggerStart).split('\n');
    const currentLine = lines.length - 1;

    setPickerState({
      isOpen: true,
      trigger,
      searchQuery,
      triggerStart,
      position: {
        top: Math.min(rect.top + (currentLine + 1) * lineHeight + 30, window.innerHeight - 350),
        left: Math.min(rect.left + 20, window.innerWidth - 340)
      }
    });
  };

  const handlePickerSelect = ({ type, id }) => {
    if (!textareaRef.current) return;

    const currentDisplay = displayValue || displayNote;
    const beforeTrigger = currentDisplay.slice(0, pickerState.triggerStart);
    const afterCursor = currentDisplay.slice(textareaRef.current.selectionStart);

    // Insert display text (will be converted to ID on save)
    let linkText;
    if (type === 'snippet') {
      const snippet = snippets.find(s => s.id === id);
      const name = String(snippet?.name || 'snippet');
      linkText = name.includes(' ') ? `@{${name}}` : `@${name}`;
    } else if (type === 'kb') {
      const kb = knowledgeTiles.find(t => t.id === id);
      linkText = `[[kb:${kb?.title || 'note'}]]`;
    } else {
      const prompt = prompts.find(p => p.id === id);
      linkText = `[[${prompt?.title || 'prompt'}]]`;
    }

    const newDisplayNote = beforeTrigger + linkText + ' ' + afterCursor;
    const newRawNote = titleToId(newDisplayNote);

    setDisplayValue(newDisplayNote);
    setRawNote(newRawNote);
    if (onSaveNote) {
      onSaveNote(newRawNote);
    } else {
      updateStepNote(promptId, stepId, newRawNote);
    }
    setPickerState(prev => ({ ...prev, isOpen: false }));

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeTrigger.length + linkText.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handlePickerClose = () => {
    setPickerState(prev => ({ ...prev, isOpen: false }));
  };

  // Close picker on scroll to prevent floating popup detachment
  const handleScroll = useCallback(() => {
    if (pickerState.isOpen) {
      setPickerState(prev => ({ ...prev, isOpen: false }));
    }
  }, [pickerState.isOpen]);

  const handlePaste = (e) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      const files = Array.from(e.clipboardData.files);
      window.dispatchEvent(new CustomEvent('lp-paste-files', { detail: { files } }));
    }
  };

  /* @PROTECTED_REGION START: NOTE_PICKER_KEYBOARD
     CRITICAL: Forwards arrow/enter/escape keys to NoteLinkPicker when picker is open.
     Without this, the textarea intercepts these keys for cursor movement. DO NOT REMOVE. */
  const handleKeyDown = (e) => {
    if (!pickerState.isOpen) return;
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  };
  /* @PROTECTED_REGION END: NOTE_PICKER_KEYBOARD */

  const handleBlur = (e) => {
    if (e.relatedTarget && e.relatedTarget.closest('[data-link-picker]')) return;
    if (!pickerState.isOpen) setIsEditing(false);
  };

  const hasLinkingEnabled = onNavigate && (prompts.length > 0 || snippets.length > 0 || knowledgeTiles.length > 0);

  // Render text with inline clickable links
  const renderInlineLinks = () => {
    const text = displayNote;

    if (!text) {
      return (
        <span className="text-text-faint">
          {hasLinkingEnabled
            ? "Click to write notes... Use [[ to link Prompts/KB, @ for Snippets"
            : "Click to write notes..."}
        </span>
      );
    }

    if (!hasLinkingEnabled) {
      return <span>{text}</span>;
    }

    const parts = [];
    let lastIndex = 0;
    // Extended regex: inline code + internal links + @{...} + URLs (https?://...)
    const linkRegex = /`([^`\n]+)`|\[\[kb:([^\]]+)\]\]|\[\[([^\]]+)\]\]|@\{([^\}]+)\}|@([^\s\[\]{}]+)|(https?:\/\/[^\s<>"\)]+)/g;

    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }

      // Check if it's inline code (match[1])
      if (match[1]) {
        parts.push(
          <code
            key={`code-${match.index}`}
            className="bg-bg-elevated border border-border px-1.5 py-0.5 rounded text-text-main font-mono text-[0.9em]"
          >
            {match[1]}
          </code>
        );
      }
      // Check if it's a URL (match[6])
      else if (match[6]) {
        const url = match[6];
        // Extract domain for cleaner display
        let displayUrl;
        try {
          const urlObj = new URL(url);
          displayUrl = urlObj.hostname.replace('www.', '') + (urlObj.pathname.length > 1 ? '/...' : '');
        } catch {
          displayUrl = url.length > 30 ? url.slice(0, 30) + '...' : url;
        }
        parts.push(
          <a
            key={`url-${match.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline px-1 py-0.5 rounded text-xs font-medium transition-all bg-primary/15 text-primary hover:bg-primary/25 hover:underline cursor-pointer whitespace-nowrap"
            title={url}
          >
            🔗 {displayUrl}
          </a>
        );
      } else {
        // Internal link (prompt, kb, snippet)
        let type, item, displayTitle;

        if (match[2]) {
          type = 'kb';
          displayTitle = match[2].trim();
          item = knowledgeTiles.find(t => t.title === displayTitle);
        } else if (match[3]) {
          type = 'prompt';
          displayTitle = match[3].trim();
          item = prompts.find(p => p.title === displayTitle);
        } else if (match[4]) {
          type = 'snippet';
          displayTitle = match[4];
          item = snippets.find(s => s.name === displayTitle);
        } else if (match[5]) {
          type = 'snippet';
          displayTitle = match[5];
          item = snippets.find(s => s.name === displayTitle);
        }

        parts.push(
          <button
            key={`link-${match.index}`}
            onClick={(e) => {
              e.stopPropagation();
              if (item) onNavigate({ type, id: item.id, tab: type === 'snippet' ? 'notes' : undefined });
            }}
            className={`inline-block max-w-full truncate align-bottom px-1 py-0.5 rounded text-xs font-medium transition-all ${item
              ? type === 'snippet' 
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 hover:underline cursor-pointer'
                : 'bg-primary/15 text-primary hover:bg-primary/25 hover:underline cursor-pointer'
              : 'bg-red-500/10 text-red-400 line-through cursor-not-allowed'
              }`}
            title={item ? `Go to ${displayTitle}` : `Not found`}
          >
            {type === 'kb' ? `[[kb:${displayTitle}]]` : type === 'prompt' ? `[[${displayTitle}]]` : type === 'snippet' ? (String(displayTitle).includes(' ') ? `@{${displayTitle}}` : `@${displayTitle}`) : `@${displayTitle}`}
          </button>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
    }

    return parts;
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="p-4 border-b border-border bg-bg-surface shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
            <StickyNote size={12} /> Notes
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-[10px] font-bold flex items-center gap-1.5 transition-opacity duration-300 ${isSaving ? 'text-green-500 opacity-100' : 'text-text-faint opacity-0'}`}>
            <Check size={10} strokeWidth={3} /> SAVED
          </div>
          {rawNote && (
            <button onClick={onResetRequest} className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-all" title="Clear notes">
              <Eraser size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
        <div className="flex-1 relative group overflow-auto" onScroll={handleScroll}>
          {isEditing ? (
            <>
              <textarea
                ref={(el) => {
                    textareaRef.current = el;
                    if (el) enableDragSelectScroll(el);
                }}
                value={displayValue}
                onChange={handleChange}
                onPaste={handlePaste}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={hasLinkingEnabled ? "Use [[ for Prompts/KB, @ for Snippets" : "Write notes..."}
                className="w-full h-full bg-bg-elevated border border-primary/50 ring-4 ring-primary/10 rounded-2xl p-5 text-sm text-text-main outline-none resize-none font-sans leading-relaxed placeholder:text-text-faint transition-all text-left"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-main)' }}
              />
              <div className="absolute bottom-4 right-4 text-[10px] text-text-faint font-mono">
                {displayValue.length} chars
              </div>
            </>
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="w-full h-full bg-bg-elevated border border-border hover:border-primary/30 rounded-2xl p-5 text-sm text-text-main cursor-text overflow-auto custom-scrollbar whitespace-pre-wrap leading-relaxed transition-all text-left"
              title="Click to edit"
            >
              {renderInlineLinks()}
            </div>
          )}
        </div>

        <div
          className="bg-bg-surface border border-border rounded-xl p-3 flex gap-3 items-center cursor-pointer hover:border-primary/30 transition-all shadow-inner"
          onClick={() => setIsInfoExpanded(!isInfoExpanded)}
        >
          <div className="p-1.5 bg-primary/5 rounded-lg shrink-0">
            <Info size={14} className="text-primary" />
          </div>
          {isInfoExpanded ? (
            <div className="text-xs text-text-muted leading-relaxed flex-1">
              <span className="font-bold text-text-main block mb-0.5">Context Repository</span>
              Notes are persistent and unique to this prompt step. They are intended for internal documentation and will be included in full system backups.
              {hasLinkingEnabled && (
                <span className="block mt-1.5 text-text-faint">
                  💡 <strong className="text-text-muted">Internal Links:</strong> Type <span className="text-primary font-semibold">[[</span> to link to Prompts or KB Notes, <span className="text-primary font-semibold">@</span> for Snippets. Links stay up-to-date when you rename the source.
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-text-muted flex-1">Context Repository · Click for info</span>
          )}
          <div className="shrink-0 text-text-faint">
            {isInfoExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>
      </div>

      {hasLinkingEnabled && pickerState.isOpen && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={handlePickerClose} />
          <NoteLinkPicker
            isOpen={pickerState.isOpen}
            onClose={handlePickerClose}
            onSelect={handlePickerSelect}
            trigger={pickerState.trigger}
            searchQuery={pickerState.searchQuery}
            position={pickerState.position}
            prompts={prompts}
            snippets={snippets}
            knowledgeTiles={knowledgeTiles}
          />
        </>
      )}
    </div>
  );
}