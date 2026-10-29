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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import {
  X,
  Upload,
  FolderOpen,
  FileText,
  ClipboardPaste,
  CheckSquare,
  Square,
  Check,
  AlertCircle,
  Sparkles,
  Merge,
  Pencil,
  Tag,
  Tags,
  Folder,
  Table,
  Trash2,
  ShieldCheck,
  Plus,
  StickyNote,
  Scissors,
  Layers,
  CornerDownRight,
  ArrowUpRight,
  BookOpen
} from 'lucide-react';
import usePromptStore from '../stores/promptStore';
import MultiTaggerModal from './MultiTaggerModal';
import { backupManager } from '../utils/backup';
import {
  IMPORT_STRATEGIES,
  buildStagedPromptsFromFiles,
  parseCSVText,
  guessCSVColumnMapping,
  countPotentialVariables,
  computeContentHash
} from '../utils/externalImportParser';

const ALLOWED_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'csv']);

function isSupportedFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.startsWith('.')) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Derives a clean, concise title from a manually highlighted text passage.
 */
function deriveExtractedTitle(rawText, fallbackBase = 'Extracted Prompt') {
  const lines = String(rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return fallbackBase;
  const firstLine = lines[0];

  const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (headingMatch) {
    const cleaned = headingMatch[1].replace(/\s*#+\s*$/, '').trim();
    if (cleaned) return cleaned.length > 75 ? cleaned.slice(0, 72).trim() + '...' : cleaned;
  }

  const stripped = firstLine
    .replace(/^[-*>•]+\s*/, '')
    .replace(/^["'„“”]+|["'“”]+$/g, '')
    .trim();

  if (!stripped) return fallbackBase;
  if (stripped.length <= 60) {
    return stripped.replace(/:$/, '').trim() || fallbackBase;
  }

  const sub = stripped.slice(0, 52);
  const lastSpace = sub.lastIndexOf(' ');
  return (lastSpace > 20 ? sub.slice(0, lastSpace) : sub).trim() + '...';
}

/**
 * Returns a normalized array of steps for any staged item.
 */
function normalizeItemSteps(item) {
  if (Array.isArray(item?.steps) && item.steps.length > 0) {
    return item.steps;
  }
  return [
    {
      id: `step_1_${item?.tempId || 'default'}`,
      title: 'Step 1',
      content: item?.content || '',
      notes: item?.notes || ''
    }
  ];
}

/**
 * Checks whether a normalized array of steps is an exact content duplicate of any existing prompt in the library.
 */
function isStepsDuplicateAgainstLibrary(steps, existingPrompts) {
  if (!Array.isArray(existingPrompts) || existingPrompts.length === 0) return false;
  const allContent = (steps || []).map(s => s?.content || '').join('\n\n');
  const hash = computeContentHash(allContent);
  return existingPrompts.some(p => {
    if (Array.isArray(p?.chain) && p.chain.length > 1) {
      return computeContentHash(p.chain.map(s => s?.content || '').join('\n\n')) === hash;
    }
    return (
      computeContentHash(p?.content || '') === hash ||
      (p?.chain?.[0]?.content && computeContentHash(p.chain[0].content) === hash)
    );
  });
}

/**
 * Synchronizes an item's top-level content, notes, variableCount, duplicate status, and steps array.
 */
function syncItemFromSteps(item, rawSteps, existingPrompts = null) {
  const safeSteps = (rawSteps || []).map((s, idx) => ({
    ...s,
    id: s.id || `step_${idx + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    title: s.title || `Step ${idx + 1}`,
    content: s.content || '',
    notes: typeof s.notes === 'string' ? s.notes : ''
  }));
  const allContent = safeSteps.map(s => s.content).join('\n\n');
  const allNotes = safeSteps.map(s => s.notes.trim()).filter(Boolean).join('\n\n');
  const nextIsDup = Array.isArray(existingPrompts)
    ? isStepsDuplicateAgainstLibrary(safeSteps, existingPrompts)
    : Boolean(item.isDuplicate);
  return {
    ...item,
    content: safeSteps[0]?.content || '',
    notes: allNotes,
    steps: safeSteps,
    variableCount: countPotentialVariables(allContent),
    isDuplicate: nextIsDup
  };
}

/**
 * Recursively traverses DataTransfer FileSystemEntry objects (for dropped folders).
 */
async function readDroppedEntries(dataTransferItems) {
  const collectedFiles = [];
  const entries = [];

  for (let i = 0; i < dataTransferItems.length; i++) {
    const item = dataTransferItems[i];
    if (item.kind === 'file') {
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry) {
        entries.push(entry);
      } else {
        const rawFile = item.getAsFile();
        if (rawFile && isSupportedFile(rawFile.name)) {
          collectedFiles.push({ file: rawFile, relativePath: rawFile.webkitRelativePath || rawFile.name });
        }
      }
    }
  }

  const traverseEntry = async (entry, pathPrefix = '') => {
    if (!entry) return;
    if (entry.isFile) {
      if (!isSupportedFile(entry.name)) return;
      await new Promise((resolve) => {
        entry.file(
          (file) => {
            collectedFiles.push({
              file,
              relativePath: pathPrefix ? `${pathPrefix}/${file.name}` : file.name
            });
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllBatch = async () => {
        const batch = await new Promise((resolve) => {
          dirReader.readEntries((res) => resolve(res || []), () => resolve([]));
        });
        if (batch.length > 0) {
          for (const child of batch) {
            await traverseEntry(child, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name);
          }
          await readAllBatch();
        }
      };
      await readAllBatch();
    }
  };

  for (const entry of entries) {
    await traverseEntry(entry, '');
  }

  return collectedFiles;
}

/**
 * Reads an array of { file, relativePath } into { name, relativePath, content }.
 */
async function decodeFileObjects(fileDescriptors) {
  const MAX_BATCH_BYTES = 50 * 1024 * 1024; // 50 MB safety cap
  let totalBytes = 0;
  const decoded = [];

  for (const desc of fileDescriptors) {
    const f = desc.file;
    if (!f || !isSupportedFile(f.name)) continue;
    if (totalBytes + f.size > MAX_BATCH_BYTES) break;
    totalBytes += f.size;

    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(typeof e.target?.result === 'string' ? e.target.result : '');
      reader.onerror = () => resolve('');
      reader.readAsText(f, 'UTF-8');
    });

    if (text && text.trim()) {
      decoded.push({
        name: f.name,
        relativePath: desc.relativePath || f.webkitRelativePath || f.name,
        content: text
      });
    }
  }

  return decoded;
}

export default function ExternalImportModal({ isOpen, onClose, onSuccess }) {
  const prompts = usePromptStore(state => state.prompts);
  const snippets = usePromptStore(state => state.snippets);
  const knowledgeTiles = usePromptStore(state => state.knowledgeTiles);
  const collections = usePromptStore(state => state.collections);
  const loadPrompts = usePromptStore(state => state.loadPrompts);

  // Raw loaded files in memory: [{ name, relativePath, content }]
  const [rawFiles, setRawFiles] = useState([]);
  const [inputMode, setInputMode] = useState('files'); // 'files' | 'paste'
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('Pasted Prompts');

  // Parsing strategy state
  const [strategy, setStrategy] = useState(IMPORT_STRATEGIES.SINGLE_PER_FILE);
  const [customDelimiter, setCustomDelimiter] = useState('### ');

  // CSV Column mapping state (if a CSV file is loaded)
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvMapping, setCsvMapping] = useState(null);

  // Staged items (editable by user before commit)
  const [stagedItems, setStagedItems] = useState([]);
  const [activePreviewId, setActivePreviewId] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleVal, setEditingTitleVal] = useState('');
  const [editingStepKey, setEditingStepKey] = useState(null); // "${promptTempId}:${stepIndex}"
  const [editingStepTitleVal, setEditingStepTitleVal] = useState('');
  const [selectedPreviewText, setSelectedPreviewText] = useState('');
  const [lastHarvestedId, setLastHarvestedId] = useState(null);
  const [lastHarvestTarget, setLastHarvestTarget] = useState(null); // { promptTempId, stepIndex }
  const [harvestFeedback, setHarvestFeedback] = useState(null);

  // Batch target settings
  const [targetCollectionId, setTargetCollectionId] = useState(''); // '' = Auto from folder / Uncategorized
  const [autoCreateFolderCollections, setAutoCreateFolderCollections] = useState(true);
  const [globalTagInput, setGlobalTagInput] = useState('');
  const [globalTags, setGlobalTags] = useState(['Imported']);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [isMultiTaggerOpen, setIsMultiTaggerOpen] = useState(false);

  // UI states
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const tagWrapperRef = useRef(null);
  const previewContentRef = useRef(null);
  const feedbackTimerRef = useRef(null);

  // Aggregate existing tags across Prompts, Snippets, and Knowledge Base (only when modal is open)
  const allTags = useMemo(() => {
    if (!isOpen) return [];
    const tagMap = {};

    if (prompts && Array.isArray(prompts)) {
      for (const p of prompts) {
        if (p?.tags) {
          for (const t of p.tags) tagMap[t] = (tagMap[t] || 0) + 1;
        }
      }
    }

    if (snippets && Array.isArray(snippets)) {
      for (const s of snippets) {
        if (s?.tags) {
          for (const t of s.tags) tagMap[t] = (tagMap[t] || 0) + 1;
        }
      }
    }

    if (knowledgeTiles && Array.isArray(knowledgeTiles)) {
      for (const t of knowledgeTiles) {
        if (t?.tags) {
          for (const tag of t.tags) tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
      }
    }

    return Object.entries(tagMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [isOpen, prompts, snippets, knowledgeTiles]);

  // Update inline tag autocomplete suggestions
  useEffect(() => {
    if (!isOpen) return;
    const cleaned = globalTagInput.trim().replace(/^#/, '').toLowerCase();
    if (!cleaned) {
      setTagSuggestions([]);
      setSelectedSuggestionIdx(-1);
      return;
    }
    const lowerSelected = new Set(globalTags.map(t => t.toLowerCase()));
    const filtered = allTags
      .map(t => t.name)
      .filter(name => typeof name === 'string' && name.toLowerCase().includes(cleaned) && !lowerSelected.has(name.toLowerCase()))
      .slice(0, 5);
    setTagSuggestions(filtered);
    setSelectedSuggestionIdx(-1);
  }, [isOpen, globalTagInput, allTags, globalTags]);

  // Close tag suggestions on outside click (strictly scoped to isOpen)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (tagWrapperRef.current && !tagWrapperRef.current.contains(event.target)) {
        setTagSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Update selected text only after mouse-up / key-up (prevents mid-drag state changes & catches drag release outside container)
  const syncPreviewSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !previewContentRef.current) {
      setSelectedPreviewText('');
      return;
    }
    const anchorInPreview = sel.anchorNode && previewContentRef.current.contains(sel.anchorNode);
    const focusInPreview = sel.focusNode && previewContentRef.current.contains(sel.focusNode);
    if (anchorInPreview && focusInPreview) {
      const trimmed = sel.toString().trim();
      setSelectedPreviewText(trimmed);
      if (trimmed) {
        setStrategy(prev => (prev === IMPORT_STRATEGIES.SINGLE_PER_FILE ? IMPORT_STRATEGIES.MANUAL_SELECTION : prev));
      }
    } else {
      setSelectedPreviewText('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('mouseup', syncPreviewSelection);
    window.addEventListener('keyup', syncPreviewSelection);
    return () => {
      window.removeEventListener('mouseup', syncPreviewSelection);
      window.removeEventListener('keyup', syncPreviewSelection);
    };
  }, [isOpen]);

  // Clear selection state when switching active preview item
  useEffect(() => {
    setSelectedPreviewText('');
  }, [activePreviewId]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Reset state when modal opens & mark feature discovery callout + NEW badge as seen/used
  useEffect(() => {
    if (isOpen) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            lp_feature_external_import_seen: true,
            lp_feature_external_import_used: true
          });
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('lp_feature_external_import_seen', 'true');
          localStorage.setItem('lp_feature_external_import_used', 'true');
        }
        window.dispatchEvent(new CustomEvent('lp-external-import-callout-dismissed'));
        window.dispatchEvent(new CustomEvent('lp-external-import-used'));
      } catch (e) {}

      setRawFiles([]);
      setInputMode('files');
      setPastedText('');
      setPastedTitle('Pasted Prompts');
      setStrategy(IMPORT_STRATEGIES.SINGLE_PER_FILE);
      setCustomDelimiter('### ');
      setCsvHeaders([]);
      setCsvMapping(null);
      setStagedItems([]);
      setActivePreviewId(null);
      setEditingTitleId(null);
      setEditingStepKey(null);
      setEditingStepTitleVal('');
      setSelectedPreviewText('');
      setLastHarvestedId(null);
      setLastHarvestTarget(null);
      setHarvestFeedback(null);
      setTargetCollectionId('');
      setAutoCreateFolderCollections(true);
      setGlobalTags(['Imported']);
      setGlobalTagInput('');
      setTagSuggestions([]);
      setSelectedSuggestionIdx(-1);
      setIsMultiTaggerOpen(false);
      setErrorMsg('');
      setIsReading(false);
      setIsCommitting(false);
    }
  }, [isOpen]);

  // Escape key handler (layered so MultiTaggerModal and tag suggestions close first)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !editingTitleId && !editingStepKey && !isCommitting) {
        if (isMultiTaggerOpen) {
          setIsMultiTaggerOpen(false);
          return;
        }
        if (tagSuggestions.length > 0) {
          setTagSuggestions([]);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingTitleId, editingStepKey, isCommitting, isMultiTaggerOpen, tagSuggestions.length, onClose]);

  // Effective input files (either uploaded files or virtual file from pasted text)
  const effectiveFiles = useMemo(() => {
    if (inputMode === 'paste') {
      if (!pastedText.trim()) return [];
      return [{
        name: `${pastedTitle.trim() || 'Pasted Prompts'}.md`,
        relativePath: `${pastedTitle.trim() || 'Pasted Prompts'}.md`,
        content: pastedText
      }];
    }
    return rawFiles;
  }, [inputMode, rawFiles, pastedText, pastedTitle]);

  // Detect if current batch contains a CSV file
  const firstCsvFile = useMemo(() => {
    return effectiveFiles.find(f => f.name.toLowerCase().endsWith('.csv')) || null;
  }, [effectiveFiles]);

  useEffect(() => {
    if (firstCsvFile) {
      const { headers } = parseCSVText(firstCsvFile.content);
      setCsvHeaders(headers);
      setCsvMapping(guessCSVColumnMapping(headers));
    } else {
      setCsvHeaders([]);
      setCsvMapping(null);
    }
  }, [firstCsvFile]);

  // Both SINGLE_PER_FILE and MANUAL_SELECTION keep each file unsplit; avoid rebuilding stagedItems
  // (which would clear browser text selection and reset activePreviewId) when switching between them.
  const effectiveSplitStrategy = strategy === IMPORT_STRATEGIES.MANUAL_SELECTION
    ? IMPORT_STRATEGIES.SINGLE_PER_FILE
    : strategy;

  // Re-compute staged items whenever files, effectiveSplitStrategy, customDelimiter, or csvMapping changes
  useEffect(() => {
    if (effectiveFiles.length === 0) {
      setStagedItems([]);
      setActivePreviewId(null);
      setLastHarvestedId(null);
      return;
    }

    const currentPrompts = usePromptStore.getState().prompts || [];
    const built = buildStagedPromptsFromFiles({
      files: effectiveFiles,
      strategy: effectiveSplitStrategy,
      customDelimiter,
      csvMapping,
      existingPrompts: currentPrompts
    });

    setStagedItems(prev => {
      const validRootNames = new Set(effectiveFiles.map(f => f.name));
      const keptHarvested = (prev || []).filter(i => {
        if (!i.isHarvested) return false;
        const rootName = i.rootFileName || String(i.sourceFile || '').replace(/\s*\(Selection\)$/i, '');
        return validRootNames.has(rootName);
      });

      if (keptHarvested.length === 0) {
        return built;
      }

      // Group kept harvested items by their root source file so we can keep their parent unchecked
      // and place harvested children directly underneath their parent document
      const harvestedByRoot = new Map();
      for (const h of keptHarvested) {
        const rootName = h.rootFileName || String(h.sourceFile || '').replace(/\s*\(Selection\)$/i, '');
        if (!harvestedByRoot.has(rootName)) harvestedByRoot.set(rootName, []);
        harvestedByRoot.get(rootName).push(h);
      }

      const merged = [];
      const placedRoots = new Set();
      for (const bItem of built) {
        const rootName = bItem.rootFileName || bItem.sourceFile;
        const children = harvestedByRoot.get(rootName);
        if (children && children.length > 0 && !placedRoots.has(rootName)) {
          placedRoots.add(rootName);
          merged.push({ ...bItem, selected: false });
          for (const child of children) {
            merged.push({
              ...child,
              rootFileName: rootName,
              parentTempId: bItem.tempId
            });
          }
        } else {
          merged.push(bItem);
        }
      }

      // Fallback for any harvested items whose root wasn't matched above
      for (const [rootName, children] of harvestedByRoot.entries()) {
        if (!placedRoots.has(rootName)) {
          merged.push(...children);
        }
      }

      return merged;
    });
    if (built.length > 0) {
      setActivePreviewId(prevId => {
        if (prevId && stagedItems.some(i => i.tempId === prevId && i.isHarvested)) {
          return prevId;
        }
        return built[0].tempId;
      });
    } else {
      setActivePreviewId(null);
    }
  }, [effectiveFiles, effectiveSplitStrategy, customDelimiter, csvMapping]);

  if (!isOpen) return null;

  const activeItem = stagedItems.find(item => item.tempId === activePreviewId) || stagedItems[0] || null;
  const activeItemSteps = useMemo(() => (activeItem ? normalizeItemSteps(activeItem) : []), [activeItem]);
  const selectedItems = stagedItems.filter(item => item.selected);
  const duplicateCount = stagedItems.filter(item => item.isDuplicate).length;

  // Set of source document tempIds that have harvested children (excluded from "Select All" so raw docs aren't re-checked by accident)
  const harvestedParentIds = useMemo(() => {
    const ids = new Set();
    for (const item of stagedItems) {
      if (item.isHarvested && item.parentTempId) {
        ids.add(item.parentTempId);
      }
    }
    return ids;
  }, [stagedItems]);

  const toggleableItems = useMemo(() => {
    const filtered = stagedItems.filter(i => !harvestedParentIds.has(i.tempId));
    return filtered.length > 0 ? filtered : stagedItems;
  }, [stagedItems, harvestedParentIds]);
  const allToggleableSelected = toggleableItems.length > 0 && toggleableItems.every(i => i.selected);

  // Target prompt for "+ Step" (the most recently extracted/focused prompt)
  const stepTargetItem =
    (lastHarvestTarget?.promptTempId && stagedItems.find(i => i.tempId === lastHarvestTarget.promptTempId)) ||
    (lastHarvestedId && stagedItems.find(i => i.tempId === lastHarvestedId && i.parentTempId === activeItem?.tempId)) ||
    (activeItem?.isHarvested ? activeItem : null);

  // Target prompt & step index for "+ Note"
  const noteTargetItem = stepTargetItem || activeItem;
  const noteTargetSteps = noteTargetItem ? normalizeItemSteps(noteTargetItem) : [];
  const noteTargetStepIdx = (
    lastHarvestTarget?.promptTempId === noteTargetItem?.tempId &&
    typeof lastHarvestTarget?.stepIndex === 'number' &&
    lastHarvestTarget.stepIndex >= 0 &&
    lastHarvestTarget.stepIndex < noteTargetSteps.length
  )
    ? lastHarvestTarget.stepIndex
    : Math.max(0, noteTargetSteps.length - 1);

  // --- FILE / FOLDER HANDLERS ---
  const handleFileInputChange = async (e) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0) return;

    setIsReading(true);
    setErrorMsg('');
    try {
      const descriptors = fileList
        .filter(f => isSupportedFile(f.name))
        .map(f => ({ file: f, relativePath: f.webkitRelativePath || f.name }));

      if (descriptors.length === 0) {
        setErrorMsg('No supported files found. Please select .md, .markdown, .txt, or .csv files.');
        setIsReading(false);
        return;
      }

      const decoded = await decodeFileObjects(descriptors);
      setRawFiles(prev => [...prev, ...decoded]);
      setInputMode('files');
    } catch (err) {
      setErrorMsg('Failed to read selected files: ' + (err.message || 'Unknown error'));
    } finally {
      setIsReading(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    setIsReading(true);
    setErrorMsg('');
    try {
      let descriptors = [];
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        descriptors = await readDroppedEntries(e.dataTransfer.items);
      } else if (e.dataTransfer?.files) {
        descriptors = Array.from(e.dataTransfer.files)
          .filter(f => isSupportedFile(f.name))
          .map(f => ({ file: f, relativePath: f.webkitRelativePath || f.name }));
      }

      if (descriptors.length === 0) {
        setErrorMsg('No supported text files (.md, .txt, .csv) found in dropped items.');
        setIsReading(false);
        return;
      }

      const decoded = await decodeFileObjects(descriptors);
      setRawFiles(prev => [...prev, ...decoded]);
      setInputMode('files');
    } catch (err) {
      setErrorMsg('Failed to process dropped items: ' + (err.message || 'Unknown error'));
    } finally {
      setIsReading(false);
    }
  };

  // --- STAGED LIST MANIPULATION ---
  const toggleItemSelection = (tempId) => {
    setStagedItems(prev => prev.map(item =>
      item.tempId === tempId ? { ...item, selected: !item.selected } : item
    ));
  };

  const toggleSelectAll = () => {
    setStagedItems(prev => {
      const parentIdsWithChildren = new Set();
      for (const i of prev) {
        if (i.isHarvested && i.parentTempId) parentIdsWithChildren.add(i.parentTempId);
      }
      const candidates = prev.filter(i => !parentIdsWithChildren.has(i.tempId));
      const targetPool = candidates.length > 0 ? candidates : prev;
      const allPoolSelected = targetPool.length > 0 && targetPool.every(i => i.selected);

      return prev.map(item => {
        if (candidates.length > 0 && parentIdsWithChildren.has(item.tempId)) {
          return allPoolSelected ? { ...item, selected: false } : item;
        }
        return { ...item, selected: !allPoolSelected };
      });
    });
  };

  const startEditingTitle = (item, e) => {
    e.stopPropagation();
    setEditingStepKey(null);
    setEditingTitleId(item.tempId);
    setEditingTitleVal(item.title);
  };

  const saveEditedTitle = (tempId) => {
    const trimmed = editingTitleVal.trim();
    if (trimmed) {
      setStagedItems(prev => prev.map(item =>
        item.tempId === tempId ? { ...item, title: trimmed } : item
      ));
    }
    setEditingTitleId(null);
  };

  const startEditingStepTitle = (promptTempId, stepIndex, currentTitle, e) => {
    e.stopPropagation();
    setEditingTitleId(null);
    setEditingStepKey(`${promptTempId}:${stepIndex}`);
    setEditingStepTitleVal(currentTitle || `Step ${stepIndex + 1}`);
  };

  const saveEditedStepTitle = (promptTempId, stepIndex) => {
    const trimmed = editingStepTitleVal.trim();
    if (trimmed) {
      setStagedItems(prev => prev.map(item => {
        if (item.tempId !== promptTempId) return item;
        const steps = normalizeItemSteps(item).map((s, idx) =>
          idx === stepIndex ? { ...s, title: trimmed } : s
        );
        return syncItemFromSteps(item, steps);
      }));
    }
    setEditingStepKey(null);
  };

  const handleMergeWithAbove = (index, e) => {
    e.stopPropagation();
    if (index <= 0 || index >= stagedItems.length) return;

    setStagedItems(prev => {
      const next = [...prev];
      const upper = next[index - 1];
      const lower = next[index];
      const upperSteps = normalizeItemSteps(upper);
      const lowerSteps = normalizeItemSteps(lower);
      const mergedContent = `${upperSteps.map(s => s.content).join('\n\n')}\n\n---\n\n${lowerSteps.map(s => s.content).join('\n\n')}`;
      const mergedNotes = [upper.notes, lower.notes].filter(Boolean).join('\n\n');

      next[index - 1] = syncItemFromSteps(
        {
          ...upper,
          selected: true,
          tags: Array.from(new Set([...(upper.tags || []), ...(lower.tags || [])]))
        },
        [
          {
            id: upperSteps[0]?.id || `step_1_${upper.tempId}`,
            title: upperSteps[0]?.title || 'Step 1',
            content: mergedContent,
            notes: mergedNotes
          }
        ],
        prompts
      );
      next.splice(index, 1);
      setActivePreviewId(next[index - 1].tempId);
      setLastHarvestTarget({ promptTempId: next[index - 1].tempId, stepIndex: 0 });
      return next;
    });
  };

  const handleAttachAsStepToAbove = (index, e) => {
    e.stopPropagation();
    if (index <= 0 || index >= stagedItems.length) return;

    setStagedItems(prev => {
      const next = [...prev];
      const upper = next[index - 1];
      const lower = next[index];
      const upperSteps = normalizeItemSteps(upper);
      const lowerSteps = normalizeItemSteps(lower);
      const combinedSteps = [...upperSteps, ...lowerSteps].map((s, idx) => ({
        ...s,
        title: (!s.title || /^Step \d+$/i.test(s.title)) ? `Step ${idx + 1}` : s.title
      }));

      next[index - 1] = syncItemFromSteps(
        {
          ...upper,
          selected: true,
          tags: Array.from(new Set([...(upper.tags || []), ...(lower.tags || [])]))
        },
        combinedSteps,
        prompts
      );
      next.splice(index, 1);
      setActivePreviewId(next[index - 1].tempId);
      setLastHarvestedId(next[index - 1].tempId);
      setLastHarvestTarget({ promptTempId: next[index - 1].tempId, stepIndex: combinedSteps.length - 1 });
      return next;
    });
  };

  const showTemporaryHarvestFeedback = (message) => {
    setHarvestFeedback(message);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setHarvestFeedback(null);
    }, 2600);
  };

  const handleExtractSelectionAsPrompt = () => {
    const rawSelected = selectedPreviewText.trim() || window.getSelection()?.toString().trim() || '';
    if (!rawSelected || !activeItem) return;

    const derivedTitle = deriveExtractedTitle(rawSelected, activeItem.title || 'Extracted Prompt');
    const newTempId = `stg_harv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const hash = computeContentHash(rawSelected);

    const isDup = isStepsDuplicateAgainstLibrary([{ content: rawSelected }], prompts)
      || stagedItems.some(i => i.selected && i.tempId !== activeItem.tempId && computeContentHash(i.content || '') === hash);

    const rootFileName = activeItem.rootFileName || String(activeItem.sourceFile || '').replace(/\s*\(Selection\)$/i, '') || 'Manual Selection';
    const cleanSourceLabel = rootFileName.endsWith('(Selection)') ? rootFileName : `${rootFileName} (Selection)`;
    const effectiveParentId = activeItem.isHarvested ? (activeItem.parentTempId || activeItem.tempId) : activeItem.tempId;

    const initialStep = {
      id: `step_1_${newTempId}`,
      title: 'Step 1',
      content: rawSelected,
      notes: ''
    };

    const newItem = syncItemFromSteps(
      {
        tempId: newTempId,
        title: derivedTitle,
        content: rawSelected,
        notes: '',
        tags: [...(activeItem.tags || [])],
        suggestedCollection: activeItem.suggestedCollection || null,
        sourceFile: cleanSourceLabel,
        rootFileName,
        variableCount: countPotentialVariables(rawSelected),
        isDuplicate: isDup,
        selected: !isDup,
        isHarvested: true,
        parentTempId: effectiveParentId
      },
      [initialStep]
    );

    setStagedItems(prev => {
      const next = [...prev];
      const parentIdx = next.findIndex(i => i.tempId === effectiveParentId);
      if (parentIdx === -1) {
        return [...next, newItem];
      }

      // Auto-uncheck the raw parent note document so only harvested prompts are selected by default
      if (!next[parentIdx].isHarvested) {
        next[parentIdx] = { ...next[parentIdx], selected: false };
      }

      // Insert right after the parent and any previously harvested children of this parent
      let insertIdx = parentIdx + 1;
      while (insertIdx < next.length && next[insertIdx].parentTempId === effectiveParentId) {
        insertIdx++;
      }

      next.splice(insertIdx, 0, newItem);
      return next;
    });

    setLastHarvestedId(newTempId);
    setLastHarvestTarget({ promptTempId: newTempId, stepIndex: 0 });
    setSelectedPreviewText('');
    try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
    showTemporaryHarvestFeedback(`Extracted "${derivedTitle}" (Step 1)`);
  };

  const handleAddSelectionAsStep = () => {
    const rawSelected = selectedPreviewText.trim() || window.getSelection()?.toString().trim() || '';
    if (!rawSelected || !stepTargetItem) return;

    const targetId = stepTargetItem.tempId;
    const currentSteps = normalizeItemSteps(stepTargetItem);
    const nextStepNum = currentSteps.length + 1;

    const updatedSteps = [
      ...currentSteps,
      {
        id: `step_${nextStepNum}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: `Step ${nextStepNum}`,
        content: rawSelected,
        notes: ''
      }
    ];

    setStagedItems(prev => prev.map(item => {
      if (item.tempId !== targetId) return item;
      const synced = syncItemFromSteps(item, updatedSteps, prompts);
      return { ...synced, selected: true };
    }));

    setLastHarvestedId(targetId);
    setLastHarvestTarget({ promptTempId: targetId, stepIndex: nextStepNum - 1 });
    setSelectedPreviewText('');
    try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
    showTemporaryHarvestFeedback(`Added Step ${nextStepNum} to "${stepTargetItem.title}"`);
  };

  const handleAddSelectionAsNote = () => {
    const rawSelected = selectedPreviewText.trim() || window.getSelection()?.toString().trim() || '';
    if (!rawSelected || !noteTargetItem) return;

    const targetId = noteTargetItem.tempId;
    const steps = normalizeItemSteps(noteTargetItem);
    const sIdx = Math.min(Math.max(0, noteTargetStepIdx), steps.length - 1);

    const updatedSteps = steps.map((s, idx) => {
      if (idx !== sIdx) return s;
      const combinedNotes = s.notes
        ? `${s.notes}\n\n${rawSelected}`
        : rawSelected;
      return { ...s, notes: combinedNotes };
    });

    setStagedItems(prev => prev.map(item => {
      if (item.tempId !== targetId) return item;
      return syncItemFromSteps(item, updatedSteps);
    }));

    setLastHarvestTarget({ promptTempId: targetId, stepIndex: sIdx });
    setSelectedPreviewText('');
    try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
    const stepSuffix = steps.length > 1 ? ` (Step ${sIdx + 1})` : '';
    showTemporaryHarvestFeedback(`Note added to "${noteTargetItem.title}"${stepSuffix}`);
  };

  const handleDetachStepAsPrompt = (promptTempId, stepIndex) => {
    const targetPrompt = stagedItems.find(i => i.tempId === promptTempId);
    if (!targetPrompt) return;
    const steps = normalizeItemSteps(targetPrompt);
    if (steps.length <= 1 || stepIndex < 0 || stepIndex >= steps.length) return;

    const detachedStep = steps[stepIndex];
    const remainingSteps = steps.filter((_, idx) => idx !== stepIndex).map((s, idx) => ({
      ...s,
      title: (!s.title || /^Step \d+$/i.test(s.title)) ? `Step ${idx + 1}` : s.title
    }));

    const hasCustomStepTitle = Boolean(detachedStep.title && !/^Step \d+$/i.test(detachedStep.title));
    const derivedTitle = hasCustomStepTitle
      ? detachedStep.title
      : deriveExtractedTitle(detachedStep.content, `${targetPrompt.title} (Step ${stepIndex + 1})`);
    const newTempId = `stg_harv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const rootFileName = targetPrompt.rootFileName || String(targetPrompt.sourceFile || '').replace(/\s*\(Selection\)$/i, '') || 'Manual Selection';

    const newItem = syncItemFromSteps(
      {
        tempId: newTempId,
        title: derivedTitle,
        content: detachedStep.content,
        notes: detachedStep.notes || '',
        tags: [...(targetPrompt.tags || [])],
        suggestedCollection: targetPrompt.suggestedCollection || null,
        sourceFile: targetPrompt.sourceFile || `${rootFileName} (Selection)`,
        rootFileName,
        variableCount: countPotentialVariables(detachedStep.content),
        isDuplicate: false,
        selected: true,
        isHarvested: true,
        parentTempId: targetPrompt.parentTempId || targetPrompt.tempId
      },
      [
        {
          id: `step_1_${newTempId}`,
          title: 'Step 1',
          content: detachedStep.content,
          notes: detachedStep.notes || ''
        }
      ],
      prompts
    );

    setStagedItems(prev => {
      const next = [...prev];
      const pIdx = next.findIndex(i => i.tempId === promptTempId);
      if (pIdx === -1) return prev;
      next[pIdx] = syncItemFromSteps(next[pIdx], remainingSteps, prompts);
      next.splice(pIdx + 1, 0, newItem);
      return next;
    });

    setLastHarvestedId(newTempId);
    setLastHarvestTarget({ promptTempId: newTempId, stepIndex: 0 });
    showTemporaryHarvestFeedback(`Detached Step ${stepIndex + 1} as "${derivedTitle}"`);
  };

  const handleRemoveStep = (promptTempId, stepIndex) => {
    setStagedItems(prev => prev.map(item => {
      if (item.tempId !== promptTempId) return item;
      const steps = normalizeItemSteps(item);
      if (steps.length <= 1) return item;
      const nextSteps = steps.filter((_, idx) => idx !== stepIndex).map((s, idx) => ({
        ...s,
        title: (!s.title || /^Step \d+$/i.test(s.title)) ? `Step ${idx + 1}` : s.title
      }));
      return syncItemFromSteps(item, nextSteps, prompts);
    }));
    setLastHarvestTarget(prev => {
      if (prev?.promptTempId !== promptTempId) return prev;
      return { promptTempId, stepIndex: Math.max(0, prev.stepIndex - (prev.stepIndex >= stepIndex ? 1 : 0)) };
    });
  };

  const handleClearStepNote = (tempId, stepIndex = 0) => {
    setStagedItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      const steps = normalizeItemSteps(item);
      const nextSteps = steps.map((s, idx) => (idx === stepIndex ? { ...s, notes: '' } : s));
      return syncItemFromSteps(item, nextSteps);
    }));
  };

  const handleRemoveStagedItem = (tempIdToRemove, e) => {
    e.stopPropagation();
    setStagedItems(prev => {
      const next = prev.filter(i => i.tempId !== tempIdToRemove);
      if (activePreviewId === tempIdToRemove) {
        setActivePreviewId(next[0]?.tempId || null);
      }
      if (lastHarvestedId === tempIdToRemove) {
        setLastHarvestedId(null);
      }
      if (lastHarvestTarget?.promptTempId === tempIdToRemove) {
        setLastHarvestTarget(null);
      }
      return next;
    });
  };

  const addGlobalTagValue = (rawVal) => {
    const val = String(rawVal || '').trim().replace(/^#/, '').replace(/,/g, '');
    if (!val) return;
    const canonical = allTags.find(t => t.name.toLowerCase() === val.toLowerCase())?.name || val;
    setGlobalTags(prev => {
      if (prev.some(t => t.toLowerCase() === canonical.toLowerCase())) return prev;
      return [...prev, canonical];
    });
    setGlobalTagInput('');
    setTagSuggestions([]);
    setSelectedSuggestionIdx(-1);
  };

  const handleAddGlobalTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedSuggestionIdx >= 0 && tagSuggestions[selectedSuggestionIdx]) {
        addGlobalTagValue(tagSuggestions[selectedSuggestionIdx]);
      } else {
        addGlobalTagValue(globalTagInput);
      }
    } else if (e.key === 'Backspace' && !globalTagInput && globalTags.length > 0) {
      setGlobalTags(prev => prev.slice(0, -1));
    } else if (e.key === 'ArrowDown') {
      if (tagSuggestions.length > 0) {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev < tagSuggestions.length - 1 ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      if (tagSuggestions.length > 0) {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev > -1 ? prev - 1 : prev));
      }
    } else if (e.key === 'Escape' && tagSuggestions.length > 0) {
      e.stopPropagation();
      setTagSuggestions([]);
      setSelectedSuggestionIdx(-1);
    }
  };

  const removeGlobalTag = (tagToRemove) => {
    setGlobalTags(prev => prev.filter(t => t !== tagToRemove));
  };

  // --- COMMIT TRANSACTION ---
  const handleCommitImport = async () => {
    if (selectedItems.length === 0 || isCommitting) return;

    setIsCommitting(true);
    setErrorMsg('');
    usePromptStore.getState().setSyncing(true);

    try {
      const sourceLabel = inputMode === 'paste'
        ? (pastedTitle.trim() || 'Clipboard Paste')
        : (rawFiles.length === 1 ? rawFiles[0].name : `${rawFiles.length} Files`);

      const result = await backupManager.commitExternalImport({
        stagedPrompts: selectedItems,
        targetCollectionId: targetCollectionId || null,
        autoCreateCollections: !targetCollectionId && autoCreateFolderCollections,
        globalTags,
        sourceLabel
      });

      await loadPrompts();

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to import prompts.');
    } finally {
      usePromptStore.getState().setSyncing(false);
      setIsCommitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => { if (!isCommitting) onClose(); }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal Window — Uses exact .modal-glass-panel and .dm-modal system without invalid /opacity hex overrides */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="modal-glass-panel dm-modal relative z-10 w-full max-w-5xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. HEADER */}
        <div className="px-6 py-4 border-b border-border dark:border-white/[0.07] flex items-center justify-between bg-bg-surface dark:bg-[#09090b] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center text-primary shrink-0">
              <Upload size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-text-main leading-none">
                  Import External Prompts
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary-subtle text-primary">
                  Lossless Staging
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Import from Notion, Obsidian, Markdown files, CSV tables, or clipboard with live preview & 1-click rollback safety.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://leanprompts.app/blog/how-to-migrate-notion-obsidian-prompts-to-ide/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors cursor-pointer select-none"
              title="Open migration guide in a new tab"
            >
              <BookOpen size={13} className="shrink-0" />
              <span>Migration Guide</span>
              <ArrowUpRight size={12} className="opacity-70 shrink-0" />
            </a>

            <button
              onClick={onClose}
              disabled={isCommitting}
              className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2. BODY */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-bg dark:bg-[#131316] space-y-5">
          {/* Input Mode Switcher & Dropzone */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              {/* Segmented Pill Control */}
              <div className="inline-flex items-center gap-1 p-1 bg-bg-secondary dark:bg-zinc-900 rounded-xl border border-border dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setInputMode('files')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    inputMode === 'files'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  <FileText size={14} />
                  <span>Files & Folders {rawFiles.length > 0 && `(${rawFiles.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    inputMode === 'paste'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  <ClipboardPaste size={14} />
                  <span>Paste Text / Document</span>
                </button>
              </div>

              {inputMode === 'files' && rawFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRawFiles([])}
                  className="text-xs text-text-muted hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} /> Clear loaded files
                </button>
              )}
            </div>

            {inputMode === 'files' ? (
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                onDrop={handleDrop}
                className={`border border-dashed rounded-xl transition-all ${
                  rawFiles.length > 0 ? 'px-4 py-2.5' : 'p-6 text-center'
                } ${
                  isDragging
                    ? 'border-primary bg-primary-subtle'
                    : 'border-zinc-300 dark:border-zinc-700/80 bg-bg-surface dark:bg-zinc-900/50 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".md,.markdown,.txt,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {rawFiles.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">
                      <strong className="text-text-main font-semibold">{rawFiles.length} file{rawFiles.length > 1 ? 's' : ''} loaded</strong> — drag & drop or click to add more
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-bg-elevated dark:bg-zinc-800/90 hover:bg-bg-hover dark:hover:bg-zinc-700/80 border border-border dark:border-white/[0.07] text-[11px] font-semibold text-text-main flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <FileText size={12} className="text-primary" />
                        <span>Add Files</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-bg-elevated dark:bg-zinc-800/90 hover:bg-bg-hover dark:hover:bg-zinc-700/80 border border-border dark:border-white/[0.07] text-[11px] font-semibold text-text-main flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <FolderOpen size={12} className="text-indigo-400" />
                        <span>Add Folder</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg bg-bg-elevated dark:bg-zinc-800/90 hover:bg-bg-hover dark:hover:bg-zinc-700/80 border border-border dark:border-white/[0.07] text-xs font-semibold text-text-main flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                      >
                        <FileText size={14} className="text-primary" />
                        <span>Select Files (.md, .txt, .csv)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg bg-bg-elevated dark:bg-zinc-800/90 hover:bg-bg-hover dark:hover:bg-zinc-700/80 border border-border dark:border-white/[0.07] text-xs font-semibold text-text-main flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                      >
                        <FolderOpen size={14} className="text-indigo-400" />
                        <span>Select Folder (Obsidian / Notion)</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      or drag and drop multiple files or entire folders right here
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 bg-bg-surface dark:bg-zinc-900/60 p-4 rounded-xl border border-border dark:border-white/[0.07]">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-text-muted shrink-0">Document Title:</label>
                  <input
                    type="text"
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. Marketing Prompts Collection"
                    className="flex-1 bg-bg-secondary dark:bg-zinc-800/90 border border-border dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none transition-colors"
                  />
                </div>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste one or multiple prompts here (e.g. separated by --- or # Headings)..."
                  className="w-full h-28 bg-bg-secondary dark:bg-zinc-800/90 border border-border dark:border-white/[0.08] rounded-xl p-3 text-xs text-text-main font-mono focus:border-primary focus:outline-none resize-y custom-scrollbar transition-colors"
                />
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Strategy & CSV Mapping Controls */}
          {effectiveFiles.length > 0 && (
            <div className="p-4 rounded-xl bg-bg-surface dark:bg-zinc-900/70 border border-border dark:border-white/[0.07] space-y-3">
              {firstCsvFile && csvHeaders.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-text-main">
                    <Table size={14} className="text-primary" />
                    <span>CSV Column Mapping ({firstCsvFile.name})</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Prompt Title Column</label>
                      <select
                        value={csvMapping?.titleIdx ?? -1}
                        onChange={(e) => setCsvMapping(prev => ({ ...prev, titleIdx: Number(e.target.value) }))}
                        className="w-full bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                      >
                        <option value={-1}>Auto-Numbered</option>
                        {csvHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Prompt Content Column *</label>
                      <select
                        value={csvMapping?.contentIdx ?? 0}
                        onChange={(e) => setCsvMapping(prev => ({ ...prev, contentIdx: Number(e.target.value) }))}
                        className="w-full bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                      >
                        {csvHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Tags Column (Optional)</label>
                      <select
                        value={csvMapping?.tagsIdx ?? -1}
                        onChange={(e) => setCsvMapping(prev => ({ ...prev, tagsIdx: Number(e.target.value) }))}
                        className="w-full bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                      >
                        <option value={-1}>None</option>
                        {csvHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Collection Column (Optional)</label>
                      <select
                        value={csvMapping?.collectionIdx ?? -1}
                        onChange={(e) => setCsvMapping(prev => ({ ...prev, collectionIdx: Number(e.target.value) }))}
                        className="w-full bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                      >
                        <option value={-1}>None</option>
                        {csvHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-text-main">Split Mode:</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: IMPORT_STRATEGIES.SINGLE_PER_FILE, label: '1 File = 1 Prompt (Safe Default)' },
                          { id: IMPORT_STRATEGIES.HORIZONTAL_RULE, label: 'Horizontal Rule (---)' },
                          { id: IMPORT_STRATEGIES.HEADINGS_H1, label: 'H1 Heading (# Title)' },
                          { id: IMPORT_STRATEGIES.CUSTOM_DELIMITER, label: 'Custom Marker' },
                          { id: IMPORT_STRATEGIES.MANUAL_SELECTION, label: 'Manual Selection', icon: Scissors }
                        ].map(opt => {
                          const IconComp = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setStrategy(opt.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                                strategy === opt.id
                                  ? 'bg-primary-subtle border-primary text-primary font-semibold'
                                  : 'bg-bg-secondary dark:bg-zinc-800/80 border-border dark:border-white/[0.07] text-text-muted hover:text-text-main'
                              }`}
                            >
                              {IconComp && <IconComp size={13} className={strategy === opt.id ? 'text-primary' : 'text-text-muted'} />}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {strategy === IMPORT_STRATEGIES.CUSTOM_DELIMITER && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Marker:</span>
                        <input
                          type="text"
                          value={customDelimiter}
                          onChange={(e) => setCustomDelimiter(e.target.value)}
                          placeholder="e.g. ### PROMPT or ==="
                          className="w-40 bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-2.5 py-1 text-xs font-mono text-text-main focus:border-primary focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGED PREVIEW SPLIT-PANE */}
          {stagedItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-xs font-bold text-text-main hover:text-primary transition-colors cursor-pointer"
                  >
                    {allToggleableSelected ? (
                      <CheckSquare size={15} className="text-primary" />
                    ) : (
                      <Square size={15} className="text-text-muted" />
                    )}
                    <span>Detected Prompts ({selectedItems.length} of {stagedItems.length} selected)</span>
                  </button>

                  {duplicateCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 font-medium">
                      {duplicateCount} exact duplicate{duplicateCount > 1 ? 's' : ''} auto-skipped
                    </span>
                  )}
                </div>

                <span className="text-[11px] text-text-muted">
                  Click any row to preview • Double-click title or click <Pencil size={11} className="inline" /> to rename
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[380px]">
                {/* Left List */}
                <div className="md:col-span-5 bg-bg-surface dark:bg-zinc-900/80 border border-border dark:border-white/[0.07] rounded-xl overflow-y-auto custom-scrollbar divide-y divide-border dark:divide-white/[0.05]">
                  {stagedItems.map((item, idx) => {
                    const isActive = activeItem?.tempId === item.tempId;
                    const isEditingThis = editingTitleId === item.tempId;
                    const itemSteps = normalizeItemSteps(item);
                    const stepCount = itemSteps.length;
                    const notesCount = itemSteps.filter(s => s.notes && s.notes.trim()).length;
                    const isCurrentTarget = stepTargetItem?.tempId === item.tempId && item.isHarvested;

                    return (
                      <div
                        key={item.tempId}
                        className={`transition-colors ${
                          isActive
                            ? 'bg-primary-subtle'
                            : 'hover:bg-bg-hover dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Main Prompt Row */}
                        <div
                          onClick={() => {
                            setActivePreviewId(item.tempId);
                            if (item.isHarvested) {
                              setLastHarvestedId(item.tempId);
                              setLastHarvestTarget(prev =>
                                prev?.promptTempId === item.tempId
                                  ? prev
                                  : { promptTempId: item.tempId, stepIndex: stepCount - 1 }
                              );
                            }
                          }}
                          className="p-2.5 flex items-center justify-between gap-2 cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleItemSelection(item.tempId);
                              }}
                              className="shrink-0 text-text-muted hover:text-primary transition-colors cursor-pointer"
                            >
                              {item.selected ? (
                                <CheckSquare size={15} className="text-primary" />
                              ) : (
                                <Square size={15} className="text-text-faint" />
                              )}
                            </button>

                            <div className="min-w-0 flex-1">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingTitleVal}
                                    onChange={(e) => setEditingTitleVal(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEditedTitle(item.tempId);
                                      if (e.key === 'Escape') setEditingTitleId(null);
                                    }}
                                    onBlur={() => saveEditedTitle(item.tempId)}
                                    className="w-full bg-bg-surface dark:bg-zinc-800 border border-primary rounded px-2 py-0.5 text-xs text-text-main focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => saveEditedTitle(item.tempId)}
                                    className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"
                                  >
                                    <Check size={13} />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onDoubleClick={(e) => startEditingTitle(item, e)}
                                  className={`text-xs font-semibold truncate ${
                                    item.selected ? 'text-text-main' : 'text-text-muted opacity-70'
                                  }`}
                                >
                                  {idx + 1}. {item.title}
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {item.isHarvested && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 font-medium"
                                    title={isCurrentTarget ? 'Active target for + Step and + Note' : 'Manually extracted prompt'}
                                  >
                                    Extracted
                                  </span>
                                )}
                                {stepCount > 1 && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 font-medium inline-flex items-center gap-0.5" title={`Multi-step prompt (${stepCount} steps)`}>
                                    <Layers size={9} /> {stepCount} Steps
                                  </span>
                                )}
                                {stepCount === 1 && notesCount > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-0.5" title="Contains Step Note">
                                    <StickyNote size={9} /> Note
                                  </span>
                                )}
                                {item.suggestedCollection && !targetCollectionId && autoCreateFolderCollections && (
                                  <span className="text-[10px] text-indigo-500 dark:text-indigo-400 flex items-center gap-0.5 truncate max-w-[120px]">
                                    <Folder size={10} /> {item.suggestedCollection}
                                  </span>
                                )}
                                {item.isDuplicate && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 dark:text-amber-400 font-medium">
                                    Already exists
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isEditingThis && (
                              <button
                                type="button"
                                onClick={(e) => startEditingTitle(item, e)}
                                className="p-1 rounded hover:bg-bg-elevated dark:hover:bg-zinc-700 text-text-muted hover:text-text-main cursor-pointer"
                                title="Rename prompt title"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handleAttachAsStepToAbove(idx, e)}
                                className="p-1 rounded hover:bg-bg-elevated dark:hover:bg-zinc-700 text-text-muted hover:text-indigo-400 cursor-pointer"
                                title={`Attach as next Step to "${stagedItems[idx - 1]?.title || 'prompt above'}"`}
                              >
                                <Layers size={12} />
                              </button>
                            )}
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handleMergeWithAbove(idx, e)}
                                className="p-1 rounded hover:bg-bg-elevated dark:hover:bg-zinc-700 text-text-muted hover:text-primary cursor-pointer"
                                title="Merge text directly into the prompt above"
                              >
                                <Merge size={12} />
                              </button>
                            )}
                            {stagedItems.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => handleRemoveStagedItem(item.tempId, e)}
                                className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 cursor-pointer"
                                title="Remove from staging list"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Nested Subfolder / Step Tree when Prompt has multiple steps */}
                        {stepCount > 1 && (
                          <div className="pl-7 pr-2.5 pb-2.5 space-y-1">
                            {itemSteps.map((step, sIdx) => {
                              const isTargetStep =
                                noteTargetItem?.tempId === item.tempId &&
                                noteTargetStepIdx === sIdx;
                              const hasStepNote = Boolean(step.notes && step.notes.trim());
                              const stepSnippet = step.title?.trim() || deriveExtractedTitle(step.content, `Step ${sIdx + 1}`);
                              const isEditingStepHere = editingStepKey === `${item.tempId}:${sIdx}`;

                              return (
                                <div
                                  key={step.id || sIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLastHarvestedId(item.tempId);
                                    setLastHarvestTarget({ promptTempId: item.tempId, stepIndex: sIdx });
                                    if (activeItem?.tempId === item.tempId) {
                                      document.getElementById(`preview-step-${item.tempId}-${sIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setActivePreviewId(item.tempId);
                                    setLastHarvestedId(item.tempId);
                                    setLastHarvestTarget({ promptTempId: item.tempId, stepIndex: sIdx });
                                    setTimeout(() => {
                                      document.getElementById(`preview-step-${item.tempId}-${sIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    }, 50);
                                  }}
                                  className={`px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors group/step ${
                                    isTargetStep
                                      ? 'bg-bg-elevated dark:bg-zinc-800 text-text-main'
                                      : 'bg-bg-secondary dark:bg-zinc-900/60 text-text-muted hover:text-text-main hover:bg-bg-elevated dark:hover:bg-zinc-800/60'
                                  }`}
                                  title={`Click to select Step ${sIdx + 1} as target for + Note • Double-click to inspect in preview`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <CornerDownRight
                                      size={11}
                                      className={isTargetStep ? 'text-primary shrink-0' : 'text-text-faint shrink-0'}
                                    />
                                    <span className={`text-[10px] font-bold shrink-0 ${isTargetStep ? 'text-primary' : 'text-indigo-400'}`}>
                                      S{sIdx + 1}:
                                    </span>
                                    {isEditingStepHere ? (
                                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingStepTitleVal}
                                          onChange={(e) => setEditingStepTitleVal(e.target.value)}
                                          onFocus={(e) => e.target.select()}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEditedStepTitle(item.tempId, sIdx);
                                            if (e.key === 'Escape') setEditingStepKey(null);
                                          }}
                                          onBlur={() => saveEditedStepTitle(item.tempId, sIdx)}
                                          className="w-full bg-bg-surface dark:bg-zinc-800 border border-primary rounded px-1.5 py-0.5 text-[11px] text-text-main focus:outline-none"
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-[11px] truncate">
                                        {stepSnippet}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {hasStepNote && (
                                      <span
                                        className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-0.5"
                                        title={`Step ${sIdx + 1} Note: ${step.notes}`}
                                      >
                                        <StickyNote size={8} /> Note
                                      </span>
                                    )}
                                    {isTargetStep && (
                                      <span
                                        className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-400 font-semibold"
                                        title="Active target when you click + Note"
                                      >
                                        Target
                                      </span>
                                    )}

                                    <div className="hidden group-hover/step:flex items-center gap-0.5 ml-0.5">
                                      {!isEditingStepHere && (
                                        <button
                                          type="button"
                                          onClick={(e) => startEditingStepTitle(item.tempId, sIdx, stepSnippet, e)}
                                          className="p-0.5 rounded hover:bg-bg-secondary dark:hover:bg-zinc-700 text-text-muted hover:text-text-main cursor-pointer"
                                          title="Rename step title"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDetachStepAsPrompt(item.tempId, sIdx);
                                        }}
                                        className="p-0.5 rounded hover:bg-bg-secondary dark:hover:bg-zinc-700 text-text-muted hover:text-primary cursor-pointer"
                                        title="Detach this Step as a separate Prompt"
                                      >
                                        <ArrowUpRight size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveStep(item.tempId, sIdx);
                                        }}
                                        className="p-0.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 cursor-pointer"
                                        title="Remove this step"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Right Live Preview & Harvester */}
                <div className="md:col-span-7 bg-bg-surface dark:bg-zinc-900/80 border border-border dark:border-white/[0.07] rounded-xl flex flex-col overflow-hidden">
                  {activeItem ? (
                    <>
                      {/* Single Fixed-Height Header Bar (h-11) — zero layout shift when selecting text */}
                      <div className="px-3.5 h-11 border-b border-border dark:border-white/[0.06] bg-bg-secondary dark:bg-zinc-900 flex items-center justify-between gap-2 shrink-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-text-main truncate">{activeItem.title}</div>
                          <div className="text-[10px] text-text-muted truncate">
                            {activeItem.sourceFile}
                            {activeItemSteps.length > 1
                              ? ` • ${activeItemSteps.length} Steps`
                              : ` • ${activeItem.content.length} chars`}
                            {activeItem.variableCount > 0 ? ` • ${activeItem.variableCount} var${activeItem.variableCount > 1 ? 's' : ''}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {selectedPreviewText ? (
                            <>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={handleExtractSelectionAsPrompt}
                                className="px-2 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title={`Extract selected text (${selectedPreviewText.length} chars) as a new standalone Prompt`}
                              >
                                <Plus size={12} strokeWidth={2.5} />
                                <span>New Prompt</span>
                              </button>

                              {stepTargetItem && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={handleAddSelectionAsStep}
                                  className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                  title={`Append selected text as Step ${normalizeItemSteps(stepTargetItem).length + 1} to "${stepTargetItem.title}"`}
                                >
                                  <Layers size={12} />
                                  <span>+ Step {normalizeItemSteps(stepTargetItem).length + 1}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={handleAddSelectionAsNote}
                                className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                title={`Attach selected text as Note to "${noteTargetItem?.title || activeItem.title}"${
                                  noteTargetSteps.length > 1 ? ` (Step ${noteTargetStepIdx + 1})` : ''
                                }`}
                              >
                                <StickyNote size={12} />
                                <span>
                                  + Note{noteTargetSteps.length > 1 ? ` (S${noteTargetStepIdx + 1})` : ''}
                                </span>
                              </button>
                            </>
                          ) : harvestFeedback ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                              <Check size={11} />
                              <span className="truncate max-w-[230px]">{harvestFeedback}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-muted flex items-center gap-1">
                              <Scissors size={11} className="text-primary shrink-0" />
                              <span>Highlight text below to extract</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        ref={previewContentRef}
                        onMouseUp={syncPreviewSelection}
                        onKeyUp={syncPreviewSelection}
                        className="flex-1 p-4 overflow-y-auto custom-scrollbar select-text"
                      >
                        {activeItemSteps.length > 1 ? (
                          <div className="space-y-3">
                            {activeItemSteps.map((step, sIdx) => {
                              const isFocusedNoteStep =
                                lastHarvestTarget?.promptTempId === activeItem.tempId &&
                                lastHarvestTarget?.stepIndex === sIdx;

                              return (
                                <div
                                  key={step.id || sIdx}
                                  id={`preview-step-${activeItem.tempId}-${sIdx}`}
                                  onClick={() => setLastHarvestTarget({ promptTempId: activeItem.tempId, stepIndex: sIdx })}
                                  className={`rounded-xl border transition-colors overflow-hidden ${
                                    isFocusedNoteStep
                                      ? 'border-indigo-500/40 bg-bg-secondary dark:bg-zinc-800/50'
                                      : 'border-border dark:border-white/[0.07] bg-bg-secondary dark:bg-zinc-900/50'
                                  }`}
                                >
                                  <div className="px-3 py-1.5 border-b border-border dark:border-white/[0.06] bg-bg-secondary dark:bg-zinc-900/90 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 flex items-center gap-1 shrink-0">
                                        <Layers size={10} /> Step {sIdx + 1}
                                      </span>
                                      {step.title?.trim() && (
                                        <span className="text-xs font-semibold text-text-main truncate">
                                          {step.title.trim()}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-text-muted shrink-0">
                                        {step.content.length} chars
                                      </span>
                                      {isFocusedNoteStep && (
                                        <span className="text-[10px] text-primary font-medium shrink-0">
                                          • Note Target
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDetachStepAsPrompt(activeItem.tempId, sIdx);
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 rounded hover:bg-bg-elevated dark:hover:bg-zinc-800 text-text-muted hover:text-primary transition-colors cursor-pointer"
                                        title="Detach this Step into its own standalone Prompt"
                                      >
                                        Split to Prompt
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveStep(activeItem.tempId, sIdx);
                                        }}
                                        className="p-0.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                                        title="Remove this step"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="p-3">
                                    <pre className="text-xs text-text-main font-mono whitespace-pre-wrap break-words leading-relaxed selection:bg-indigo-500/30 selection:text-text-main">
                                      {step.content}
                                    </pre>
                                  </div>

                                  {step.notes && (
                                    <div className="px-3 py-2 border-t border-amber-500/20 bg-amber-500/5 flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-1.5 min-w-0">
                                        <StickyNote size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                        <div className="text-[11px] text-text-main whitespace-pre-wrap break-words">
                                          <span className="font-bold text-amber-600 dark:text-amber-400 mr-1">
                                            Step {sIdx + 1} Note:
                                          </span>
                                          {step.notes}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleClearStepNote(activeItem.tempId, sIdx);
                                        }}
                                        className="text-text-muted hover:text-red-400 p-0.5 shrink-0 cursor-pointer"
                                        title="Clear step note"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <pre className="text-xs text-text-main font-mono whitespace-pre-wrap break-words leading-relaxed selection:bg-indigo-500/30 selection:text-text-main">
                            {activeItem.content}
                          </pre>
                        )}
                      </div>

                      {activeItemSteps.length === 1 && activeItemSteps[0]?.notes && (
                        <div className="px-4 py-2 border-t border-amber-500/20 bg-amber-500/5 flex items-start justify-between gap-2 max-h-20 overflow-y-auto custom-scrollbar shrink-0">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <StickyNote size={12} className="text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-text-main whitespace-pre-wrap break-words">
                              <span className="font-bold text-amber-600 dark:text-amber-400 mr-1">Step Note:</span>
                              {activeItemSteps[0].notes}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearStepNote(activeItem.tempId, 0)}
                            className="text-text-muted hover:text-red-400 p-0.5 shrink-0 cursor-pointer"
                            title="Clear note"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}

                      {activeItem.tags?.length > 0 && (
                        <div className="px-4 py-1.5 border-t border-border dark:border-white/[0.06] bg-bg-secondary dark:bg-zinc-900 flex items-center gap-1.5 flex-wrap shrink-0">
                          <Tag size={11} className="text-text-muted" />
                          {activeItem.tags.map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated dark:bg-zinc-800 border border-border dark:border-white/[0.07] text-text-muted">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
                      Select a prompt on the left to inspect its content.
                    </div>
                  )}
                </div>
              </div>

              {/* Target Collection & Global Tags Bar */}
              <div className="p-3.5 rounded-xl bg-bg-surface dark:bg-zinc-900/70 border border-border dark:border-white/[0.07] grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Folder size={12} className="text-indigo-400" /> Target Collection
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={targetCollectionId}
                      onChange={(e) => setTargetCollectionId(e.target.value)}
                      className="flex-1 bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-text-main focus:border-primary focus:outline-none"
                    >
                      <option value="">
                        {autoCreateFolderCollections ? 'Auto-detect from folder (or Uncategorized)' : 'Uncategorized'}
                      </option>
                      {(collections || []).map(col => (
                        <option key={col.id} value={col.id}>{col.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={12} className="text-primary" /> Batch Tags (applied to all imported prompts)
                  </label>
                  <div className="flex items-start gap-1.5">
                    <div ref={tagWrapperRef} className="relative flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] focus-within:border-primary rounded-lg px-2.5 py-1 min-h-[34px] max-h-20 overflow-y-auto custom-scrollbar transition-colors">
                        {globalTags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-subtle text-primary text-[11px] font-medium"
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => removeGlobalTag(tag)}
                              className="hover:text-red-400 cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={globalTagInput}
                          onChange={(e) => setGlobalTagInput(e.target.value)}
                          onKeyDown={handleAddGlobalTag}
                          onBlur={() => addGlobalTagValue(globalTagInput)}
                          placeholder={globalTags.length === 0 ? "Type to add tag..." : "Add tag + Enter..."}
                          className="flex-1 min-w-[100px] bg-transparent text-xs text-text-main focus:outline-none h-[22px]"
                        />
                      </div>

                      {tagSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 bottom-full mb-1.5 bg-bg-surface border border-border rounded-lg shadow-xl z-[9999] overflow-hidden animate-in fade-in duration-150 dm-dropdown">
                          {tagSuggestions.map((suggestion, index) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => addGlobalTagValue(suggestion)}
                              onMouseDown={(e) => e.preventDefault()}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                                index === selectedSuggestionIdx
                                  ? 'bg-primary-subtle text-primary font-medium'
                                  : 'text-text-main hover:bg-bg-elevated'
                              }`}
                            >
                              <span>#{suggestion}</span>
                              {index === selectedSuggestionIdx && <span className="text-[10px] text-text-muted">Enter</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMultiTaggerOpen(true)}
                      className="p-2 h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded-lg bg-bg-secondary dark:bg-zinc-800 border border-border dark:border-white/[0.08] text-text-muted hover:text-primary hover:border-primary hover:bg-primary-subtle transition-all shadow-sm group cursor-pointer"
                      title="Open Multi-Tagger"
                    >
                      <Tags size={15} className="group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. FOOTER */}
        <div className="px-6 py-4 border-t border-border dark:border-white/[0.07] bg-bg-surface dark:bg-[#09090b] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <ShieldCheck size={15} className="text-emerald-500 shrink-0" />
            <span>Protected by Atomic Batch Rollback — You can undo this entire import in Settings with 1 click.</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isCommitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-text-main border border-border dark:border-white/[0.08] bg-bg-secondary dark:bg-zinc-800/80 hover:bg-bg-hover dark:hover:bg-zinc-700/80 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCommitImport}
              disabled={selectedItems.length === 0 || isCommitting || isReading}
              className="px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 bg-primary hover:bg-primary-hover text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              {isCommitting ? (
                <>
                  <Sparkles size={14} className="animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>Import {selectedItems.length} Prompt{selectedItems.length === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      <MultiTaggerModal
        isOpen={isMultiTaggerOpen}
        onClose={() => setIsMultiTaggerOpen(false)}
        promptTitle={`Batch Import (${selectedItems.length} prompt${selectedItems.length === 1 ? '' : 's'})`}
        allTags={allTags}
        currentTags={globalTags}
        onSave={(newTags) => {
          const cleaned = Array.from(
            new Set(
              (newTags || [])
                .map(t => String(t).trim().replace(/^#/, ''))
                .filter(Boolean)
            )
          );
          setGlobalTags(cleaned);
        }}
      />
    </div>,
    document.body
  );
}
