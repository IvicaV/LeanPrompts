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
import { create } from 'zustand';
import { dbAPI } from '../utils/db';
import { SEED_PROMPTS, SEED_SNIPPETS } from '../utils/seedData';

import { DEFAULT_LLMS } from '../utils/llmConstants';
import { escapeRegExp } from '../utils/variableParser';

const DEFAULT_SETTINGS = {
  confirmDelete: true, // POINT 6: Switch for delete confirmation
  autoBackup: true,
  lastBackupTime: null
};

const usePromptStore = create((set, get) => ({
  prompts: [],
  snippets: [],
  llms: [],
  collections: [],
  knowledgeTiles: [], // New!
  settings: DEFAULT_SETTINGS, // Global settings object

  isLoading: true,
  isSyncing: false, // Prevents auto-saves during global operations
  isEditing: false, // NEW: Lock for cross-tab sync during active typing
  pendingSave: false, // PROTECTION: Defer reloads while a save is in progress
  activePromptId: null,
  activeSnippetId: null,
  activeCollectionId: null, // Currently selected collection filter
  sortMode: 'updated', // 'updated', 'created', 'accessed', 'rating'
  snippetSortMode: 'updated', // 'updated', 'rating', 'usage', 'name'
  lastWriteTimestamp: 0, // PROTECTION: Guards against stale reloads immediately after a local write

  setSyncing: (isSyncing) => {
    set({ isSyncing });
    // Broadcast to other tabs immediately
    if (get()._syncChannel) {
      get()._syncChannel.postMessage(isSyncing ? 'START_GLOBAL_SYNC' : 'END_GLOBAL_SYNC');
    }
  },
  setEditing: (bool) => set({ isEditing: bool }),

  // Helper function for consistent sorting: Pinned first, then chosen criterion
  sortPrompts: (list, mode = get().sortMode) => {
    return [...list].sort((a, b) => {
      // Pinned always on top
      if (!!a.isPinned !== !!b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      switch (mode) {
        case 'created':
          return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt);
        case 'accessed':
          return new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0);
        case 'rating':
          if ((b.rating || 0) !== (a.rating || 0)) {
            return (b.rating || 0) - (a.rating || 0);
          }
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        case 'title':
          return (a.title || "").localeCompare(b.title || "");
        case 'updated':
        default:
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
    });
  },

  sortSnippets: (list, mode = get().snippetSortMode) => {
    return [...list].sort((a, b) => {
      // Pinned always on top
      if (!!a.isPinned !== !!b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      switch (mode) {
        case 'rating':
          if ((b.rating || 0) !== (a.rating || 0)) {
            return (b.rating || 0) - (a.rating || 0);
          }
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        case 'usage':
          const countA = (a.usageCount || 0);
          const countB = (b.usageCount || 0);
          if (countB !== countA) return countB - countA;
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        case 'name':
          return (a.name || "").localeCompare(b.name || "");
        case 'updated':
        default:
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
    });
  },

  // --- INIT & MIGRATION ---
  loadPrompts: async () => {
    // SINGLETON CHANNEL INIT
    if (!get()._syncChannel) {
      const channel = new BroadcastChannel('leanprompts_sync');
      channel.onmessage = (event) => {
        if (event.data === 'RELOAD_DATA') {
          const isFocused = () => {
            if (typeof document === 'undefined') return false;
            const active = document.activeElement;
            return active && (['INPUT', 'TEXTAREA'].includes(active.tagName) || active.contentEditable === 'true' || active.classList.contains('cm-content'));
          };

          // SYNC SHIELD: If we are currently saving, editing, focused, OR have just written to the DB ourselves,
          // we ignore the reload to prevent focus loss or "Sync-Race" overwrites.
          const timeSinceLastWrite = Date.now() - get().lastWriteTimestamp;
          if (get().pendingSave || get().isEditing || isFocused() || timeSinceLastWrite < 1500) {
            console.log("LeanPrompts: Sync Shield active (Saving/Editing/Focused/JustWritten), ignoring RELOAD_DATA.");
            return;
          }
          get().loadPrompts();
        } else if (event.data === 'START_GLOBAL_SYNC') {
          set({ isSyncing: true });
        } else if (event.data === 'END_GLOBAL_SYNC') {
          set({ isSyncing: false });
        }
      };
      set({ _syncChannel: channel });
    }

    set({ isLoading: true });
    try {
      const [rawPrompts, snippets, collections, indexedKnowledge, storageData] = await Promise.all([
        dbAPI.getAllPrompts(),
        dbAPI.getAllSnippets(),
        dbAPI.getAllCollections(),
        dbAPI.getAllKnowledge(), // Try IndexedDB first
        chrome.storage.local.get(['custom_llms', 'lp_settings', 'lp_knowledge_tiles', 'lp_sort_mode', 'lp_snippet_sort_mode'])
      ]);

      const initialSortMode = storageData.lp_sort_mode || 'updated';
      const initialSnippetSortMode = storageData.lp_snippet_sort_mode || 'updated';

      // --- MIGRATION: Knowledge Base (Storage -> IndexedDB) ---
      let knowledge = indexedKnowledge || [];
      if (knowledge.length === 0 && storageData.lp_knowledge_tiles && storageData.lp_knowledge_tiles.length > 0) {
        console.log("Migrating Knowledge Base to IndexedDB...");
        const toMigrate = storageData.lp_knowledge_tiles;

        try {
          // Wir warten, bis wirklich ALLE gespeichert sind
          await Promise.all(toMigrate.map(tile => dbAPI.saveKnowledge(tile)));
          knowledge = await dbAPI.getAllKnowledge();
          // Erst wenn die DB bestätigt, dass alles da ist, löschen wir den alten Ort
          chrome.storage.local.remove('lp_knowledge_tiles');
        } catch (e) {
          console.error("Migration failed, keeping backup in storage.local", e);
          knowledge = toMigrate; // Fallback für diese Session
        }
      }

      const migratedPrompts = rawPrompts.map(p => {
        // Migration: Ensure all fields are present
        if (!p.ignoredVariables) p.ignoredVariables = [];
        if (!p.createdAt) p.createdAt = p.updatedAt || new Date().toISOString();
        if (!p.lastAccessed) p.lastAccessed = 0;
        if (p.rating === undefined) p.rating = 0;

        let promptWithChain = p;
        if (!p.chain) {
          promptWithChain = {
            ...p,
            chain: [
              {
                id: `step-${p.id}`, // Stable ID for primary step
                title: "Main Prompt",
                content: p.content || "",
                versions: p.versions || [],
                notes: p.notes || "",
                isVisible: true
              }
            ],
            content: p.content || "",
            versions: [],
            isPinned: p.isPinned || false,
            usageCount: p.usageCount || 0,
          };
        }

        const updatedChain = promptWithChain.chain.map(step => ({
          ...step,
          title: step.title || "",
          notes: step.notes || "",
          // PROMPT AUTO-SNAPSHOT: Mark as ready if it has content but no history
          autoSnapshotReady: (step.content?.trim() !== "" && (!step.versions || step.versions.length === 0))
        }));

        return { ...promptWithChain, chain: updatedChain };
      });

      // Merge stored LLMs with DEFAULT_LLMS to inherit new fields (like alternativeDomains)
      // while preserving user customizations
      const mergedLlms = (() => {
        const storedLlms = storageData.custom_llms;
        if (!storedLlms) return DEFAULT_LLMS;

        return storedLlms.map(stored => {
          // Find matching default by id to inherit new fields
          const defaultMatch = DEFAULT_LLMS.find(d => d.id === stored.id);
          if (defaultMatch) {
            // Merge: stored values override, but inherit new fields from default
            return { ...defaultMatch, ...stored };
          }
          return stored;
        });
      })();

      set({
        sortMode: initialSortMode,
        snippetSortMode: initialSnippetSortMode,
        prompts: get().sortPrompts(migratedPrompts, initialSortMode),
        snippets: get().sortSnippets(snippets.map(s => ({
          ...s,
          isPinned: s.isPinned || false,
          rating: s.rating || 0,
          createdAt: s.createdAt || s.updatedAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString(),
          versions: s.versions || [] // Ensure versions array exists
        })), initialSnippetSortMode),
        collections: collections || [],
        knowledgeTiles: knowledge || [],
        llms: mergedLlms,
        settings: { ...DEFAULT_SETTINGS, ...storageData.lp_settings },
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      set({ isLoading: false });
    }
  },

  // --- PROMPTS CRUD ---
  savePrompt: async (promptData) => {
    let finalPrompt = { ...promptData };

    if (!finalPrompt.chain || finalPrompt.chain.length === 0) {
      finalPrompt.chain = [{
        id: crypto.randomUUID(),
        title: "",
        content: finalPrompt.content || "",
        versions: [],
        notes: "",
        isVisible: true
      }];
    }

    if (!finalPrompt.ignoredVariables) {
      finalPrompt.ignoredVariables = [];
    }

    // PROMPT AUTO-SNAPSHOT: Detect first modification of a "finished draft" step
    const existingPrompt = get().prompts.find(p => p.id === finalPrompt.id);

    // RELATIONAL GUARD: If title changed, update KB links
    const oldTitle = existingPrompt?.title;
    const newTitle = finalPrompt.title;
    if (oldTitle && newTitle && oldTitle !== newTitle) {
      const tiles = get().knowledgeTiles;
      const escapedOldTitle = escapeRegExp(oldTitle);
      const wikiRegex = new RegExp(`\\[\\[${escapedOldTitle}\\]\\]`, 'g'); // Match exact [[Title]]

      for (const tile of tiles) {
        if (tile.content?.match(wikiRegex)) {
          const updatedContent = tile.content.replace(wikiRegex, `[[${newTitle}]]`);
          await get().saveKnowledgeTile({ ...tile, content: updatedContent });
        }
      }
    }

    if (existingPrompt && existingPrompt.chain) {
      finalPrompt.chain = finalPrompt.chain.map(step => {
        const existingStep = existingPrompt.chain.find(s => s.id === step.id);
        if (!existingStep) return step;

        // HIGH-END LOGIC: Eligible ONLY if explicitly marked as a baseline via Activity Boundaries
        const isSnapshotEligible = existingStep.autoSnapshotReady;

        if (isSnapshotEligible) {
          if (existingStep.content?.trim() !== (step.content || "").trim()) {
            const snapshot = {
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              content: existingStep.content || "",
              note: "Initial Auto-Snapshot"
            };
            return {
              ...step,
              versions: [snapshot, ...(step.versions || [])].slice(0, 25),
              autoSnapshotReady: false // Snapshot created, flag consumed
            };
          } else {
            // Content hasn't changed significantly yet, preserve eligibility
            return { ...step, autoSnapshotReady: true };
          }
        }
        return step;
      });
    }

    finalPrompt.updatedAt = new Date().toISOString();

    // 1. Sichere den aktuellen Zustand VOR dem Update (für potenziellen Rollback)
    const previousPrompts = get().prompts;

    // 2. Optimistic UI Update
    set(state => {
      const exists = state.prompts.find(p => p.id === finalPrompt.id);
      const newPromptsList = exists
        ? state.prompts.map(p => p.id === finalPrompt.id ? finalPrompt : p)
        : [finalPrompt, ...state.prompts];
      return { 
        prompts: state.sortPrompts(newPromptsList, state.sortMode),
        pendingSave: true, 
        lastWriteTimestamp: Date.now() 
      };
    });

    // 3. Datenbank-Schreibversuch mit Rollback-Sicherung
    try {
      await dbAPI.savePrompt(finalPrompt);
      // Wenn erfolgreich, triggern wir die Background-Updates
      chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
      if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
    } catch (error) {
      // ⚠️ FEHLERFALL: Lade den wahren Stand direkt aus der DB
      console.error("LeanPrompts: Database write failed. Reloading state.", error);
      await get().loadPrompts();
      throw new Error("Failed to save to database. Quota exceeded or internal error.");
    } finally {
      set({ pendingSave: false });
    }
  },

  closeSyncChannel: () => {
    const channel = get()._syncChannel;
    if (channel) {
      channel.close();
      set({ _syncChannel: null });
    }
  },

  updateStepNote: async (promptId, stepId, noteText) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const newChain = prompt.chain.map(step =>
      step.id === stepId ? { ...step, notes: noteText } : step
    );

    await get().savePrompt({ ...prompt, chain: newChain });
  },

  updateStepTitle: async (promptId, stepId, titleText) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const newChain = prompt.chain.map(step =>
      step.id === stepId ? { ...step, title: titleText } : step
    );

    await get().savePrompt({ ...prompt, chain: newChain });
  },

  moveStep: async (promptId, stepId, direction) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt || !prompt.chain) return;

    const index = prompt.chain.findIndex(s => s.id === stepId);
    if (index === -1) return;

    const newChain = [...prompt.chain];
    if (direction === 'up' && index > 0) {
      [newChain[index], newChain[index - 1]] = [newChain[index - 1], newChain[index]];
    } else if (direction === 'down' && index < newChain.length - 1) {
      [newChain[index], newChain[index + 1]] = [newChain[index + 1], newChain[index]];
    } else {
      return;
    }

    const newLegacyContent = newChain.map(s => s.content).join('\n');
    await get().savePrompt({ ...prompt, chain: newChain, content: newLegacyContent });
  },

  toggleVariableIgnore: async (promptId, variableName) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const currentIgnored = prompt.ignoredVariables || [];
    const newIgnored = currentIgnored.includes(variableName)
      ? currentIgnored.filter(v => v !== variableName)
      : [...currentIgnored, variableName];

    await get().savePrompt({ ...prompt, ignoredVariables: newIgnored });
  },

  savePreset: async (promptId, presetName, values, files = []) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const currentPresets = prompt.presets || {};
    const newPresets = {
      ...currentPresets,
      [presetName]: {
        values: { ...values },
        files: files.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size,
          data: f.data, // This is the Base64 string from FileReader
          lastModified: f.lastModified
        })),
        updatedAt: new Date().toISOString()
      }
    };

    await get().savePrompt({ ...prompt, presets: newPresets });
  },

  deletePreset: async (promptId, presetName) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const currentPresets = prompt.presets || {};
    const { [presetName]: removed, ...newPresets } = currentPresets;

    await get().savePrompt({ ...prompt, presets: newPresets });
  },

  deletePrompt: async (id) => {
    await dbAPI.deletePrompt(id);
    set(state => ({ 
      prompts: state.prompts.filter((p) => p.id !== id),
      activePromptId: state.activePromptId === id ? null : state.activePromptId 
    }));
    chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
  },

  // --- ZERO-REGRESSION: SECURE FORK LOGIC ---
  duplicatePrompt: async (id) => {
    const original = get().prompts.find(p => p.id === id);
    if (!original) return;

    // 1. Deep Clone via JSON (kappt zu 100% alle Referenzen zum Original)
    const cloned = JSON.parse(JSON.stringify(original));
    const newId = crypto.randomUUID();

    // 2. Reset Metadaten & Historie (verhindert DB-Bloat)
    cloned.id = newId;
    cloned.title = `${cloned.title} (Copy)`;
    cloned.createdAt = new Date().toISOString();
    cloned.updatedAt = new Date().toISOString();
    cloned.isPinned = false; // Ein Fork sollte nicht automatisch den Pinned-Bereich fluten
    cloned.versions = []; 

    // 3. Deep ID-Rotation: Zwingend nötig, damit React nicht über doppelte Keys stolpert
    if (cloned.chain && Array.isArray(cloned.chain)) {
      cloned.chain = cloned.chain.map(step => ({
        ...step,
        id: crypto.randomUUID(), // Neuer Key für den Workspace
        versions: []             // Historie des Steps leeren
      }));
    }

    // 4. Speichern und sofort aktivieren (nutzt deine bestehende, robuste Infrastruktur)
    await get().savePrompt(cloned);
    await get().setActivePrompt(newId);
  },
  // --- ENDE FORK LOGIC ---

  bulkDeletePrompts: async (ids) => {
    await Promise.all(ids.map(id => dbAPI.deletePrompt(id)));
    set(state => ({
      prompts: state.sortPrompts(state.prompts.filter(p => !ids.includes(p.id)), state.sortMode),
      activePromptId: ids.includes(state.activePromptId) ? null : state.activePromptId
    }));
    chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
  },

  setActivePrompt: async (id) => {
    const oldId = get().activePromptId;

    // 1. AUTO-SNAPSHOT: Mark old prompt as ready
    // ZERO-REGRESSION: Functional state update prevents stale closure overwrites
    if (oldId && oldId !== id) {
      set(state => {
        const oldPrompt = state.prompts.find(p => p.id === oldId);
        if (!oldPrompt) return state; // Fail-safe fallback
        
        const updatedOldChain = oldPrompt.chain.map(step => ({
          ...step,
          autoSnapshotReady: step.content?.trim() !== "" && (!step.versions || step.versions.length === 0)
        }));
        const updatedOldPrompt = { ...oldPrompt, chain: updatedOldChain };
        
        // Fire & forget DB save (no await blocking the UI thread)
        dbAPI.savePrompt(updatedOldPrompt).catch(e => console.error("LeanPrompts: Auto-snapshot marker save failed", e));
        
        return { prompts: state.prompts.map(p => p.id === oldId ? updatedOldPrompt : p) };
      });
    }

    // 2. Set new active ID and update lastAccessed
    // ZERO-REGRESSION: Functional state update guarantees UI sync
    set(state => {
      const prompt = state.prompts.find(p => p.id === id);
      if (!prompt) return { activePromptId: id }; // Fail-safe fallback

      const updated = { ...prompt, lastAccessed: new Date().toISOString() };
      
      // Fire & forget DB save (no await blocking the UI thread)
      dbAPI.savePrompt(updated).catch(e => console.error("LeanPrompts: Last accessed save failed", e));

      return { 
        activePromptId: id,
        prompts: state.prompts.map(p => p.id === id ? updated : p) 
      };
    });
  },

  setSortMode: (mode) => {
    chrome.storage.local.set({ lp_sort_mode: mode });
    set({ sortMode: mode, prompts: get().sortPrompts(get().prompts, mode) });
  },

  setRating: async (id, rating) => {
    // OPTIMISTIC UPDATE: Instant UI response, DB sync follows
    set(state => ({
      prompts: state.sortPrompts(
        state.prompts.map(p => p.id === id ? { ...p, rating } : p),
        state.sortMode
      )
    }));
    const latestPrompt = get().prompts.find(p => p.id === id);
    if (latestPrompt) await get().savePrompt(latestPrompt);
  },

  togglePin: async (id) => {
    // OPTIMISTIC UPDATE: Instant UI response, DB sync follows
    set(state => ({
      prompts: state.sortPrompts(
        state.prompts.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p),
        state.sortMode
      )
    }));
    const latestPrompt = get().prompts.find(p => p.id === id);
    if (latestPrompt) await get().savePrompt(latestPrompt);
  },

  // --- VERSIONING ---
  createVersion: async (promptId, note = "", stepId = null) => {
    const { prompts, savePrompt } = get();
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const createStepSnapshot = (step, customNote) => {
      // Intelligent check: Only create if content differs from latest version
      const latestVersion = step.versions?.[0];
      if (latestVersion && latestVersion.content === step.content) {
        return null; // No change
      }

      return {
        id: crypto.randomUUID(),
        content: step.content,
        timestamp: new Date().toISOString(),
        note: customNote || (stepId ? "Manual Snapshot" : "Global Save")
      };
    };

    if (stepId) {
      // Single step snapshot
      const step = prompt.chain?.find(s => s.id === stepId);
      if (!step) return;

      const snapshot = createStepSnapshot(step, note);
      if (!snapshot) return; // Skip if no change

      const updatedChain = prompt.chain.map(s =>
        s.id === stepId
          ? { ...s, versions: [snapshot, ...(s.versions || [])].slice(0, 50) }
          : s
      );
      await savePrompt({ ...prompt, chain: updatedChain });
    } else {
      // Global snapshot (all steps in the prompt)
      let changed = false;
      const updatedChain = prompt.chain.map(s => {
        const snapshot = createStepSnapshot(s, note);
        if (snapshot) {
          changed = true;
          return { ...s, versions: [snapshot, ...(s.versions || [])].slice(0, 50) };
        }
        return s;
      });

      if (changed) {
        await savePrompt({ ...prompt, chain: updatedChain });
      }
    }
  },

  restoreVersion: async (promptId, versionContent, stepId = null) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    let updatedChain = [...prompt.chain];
    let newGlobalContent = prompt.content;

    if (stepId) {
      updatedChain = updatedChain.map(step => {
        if (step.id === stepId) {
          return { ...step, content: versionContent };
        }
        return step;
      });
      newGlobalContent = updatedChain.map(s => s.content).join('\n');
    } else {
      if (updatedChain.length > 0) {
        updatedChain[0].content = versionContent;
      }
      newGlobalContent = versionContent;
    }

    await get().savePrompt({ ...prompt, content: newGlobalContent, chain: updatedChain });
  },

  updateVersionNote: async (promptId, versionId, newNote, stepId = null) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const updateList = (list) => list.map(v => v.id === versionId ? { ...v, note: newNote } : v);
    let updatedChain = [...prompt.chain];

    if (stepId) {
      updatedChain = updatedChain.map(step => {
        if (step.id === stepId) {
          return { ...step, versions: updateList(step.versions || []) };
        }
        return step;
      });
    } else {
      updatedChain = updatedChain.map(step => ({
        ...step,
        versions: updateList(step.versions || [])
      }));
    }

    await get().savePrompt({ ...prompt, chain: updatedChain });
  },

  // SNIPPET VERSIONING
  createSnippetVersion: async (snippetId, note = "") => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    // Intelligent check: Only create if content differs from latest version
    const latestVersion = snippet.versions?.[0];
    if (latestVersion && latestVersion.content === snippet.content) {
      return; // No change
    }

    const snapshot = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      content: snippet.content,
      note: note || `Snapshot ${new Date().toLocaleTimeString()}`
    };

    const newVersions = [snapshot, ...(snippet.versions || [])].slice(0, 50);
    await get().saveSnippet({ ...snippet, versions: newVersions }, false); // false = don't auto-snapshot again
  },

  restoreSnippetVersion: async (snippetId, versionContent) => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    await get().saveSnippet({ ...snippet, content: versionContent });
  },

  updateSnippetVersionNote: async (snippetId, versionId, newNote) => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    const newVersions = (snippet.versions || []).map(v =>
      v.id === versionId ? { ...v, note: newNote } : v
    );

    await get().saveSnippet({ ...snippet, versions: newVersions }, false);
  },

  deleteSnippetVersion: async (snippetId, versionId) => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    const newVersions = (snippet.versions || []).filter(v => v.id !== versionId);
    await get().saveSnippet({ ...snippet, versions: newVersions }, false);
  },

  updateSnippetNote: async (snippetId, noteText) => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    // Pass false to saveSnippet to prevent auto-snapshotting just for a note change
    await get().saveSnippet({ ...snippet, notes: noteText }, false);
  },

  // --- SNIPPETS ---
  saveSnippet: async (snippetData, autoSnapshot = true) => {
    const current = get().snippets;
    const existing = current.find(s => s.id === snippetData.id);

    // AUTO-SNAPSHOT LOGIC: Only create ONE snapshot automatically if none exist
    let versions = snippetData.versions || (existing ? existing.versions : []);
    const hasHistory = versions && versions.length > 0;

    if (autoSnapshot && existing && !hasHistory && snippetData.content !== undefined && existing.content !== snippetData.content) {
      // FIX: Verhindere, dass leere Zustände (z.B. direkt nach dem Erstellen) als Snapshot gespeichert werden.
      // Der "alte" Zustand muss echten Inhalt haben.
      if (existing.content && existing.content.trim() !== "" && existing.content.trim() !== snippetData.content.trim()) {
        const snapshot = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          content: existing.content,
          note: `Initial Auto-Snapshot`
        };
        versions = [snapshot];
      }
    }

    const now = new Date().toISOString();
    const newSnippet = {
      ...(existing || {}), // PROTECTION: Preserve isPinned, rating, etc. from existing record
      ...snippetData,
      versions,
      createdAt: (existing && existing.createdAt) || snippetData.createdAt || now,
      updatedAt: now,
      usageCount: snippetData.usageCount || (existing ? existing.usageCount : 0)
    };

    const previousSnippets = get().snippets;

    // LÖSUNG 1: Optimistic UI Update
    set(state => {
      const exists = state.snippets.find(s => s.id === newSnippet.id);
      const newList = exists
        ? state.snippets.map(s => s.id === newSnippet.id ? newSnippet : s)
        : [newSnippet, ...state.snippets];
      return { 
        snippets: state.sortSnippets(newList, state.snippetSortMode),
        lastWriteTimestamp: Date.now()
      };
    });

    // DANN asynchron in DB mit Rollback-Sicherung
    try {
      await dbAPI.saveSnippet(newSnippet);
      if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
    } catch (error) {
      console.error("LeanPrompts: Snippet database write failed. Rolling back UI.", error);
      await get().loadPrompts();
      throw new Error("Failed to save snippet to database. Quota exceeded or internal error.");
    }
  },

  setSnippetSortMode: (mode) => {
    chrome.storage.local.set({ lp_snippet_sort_mode: mode });
    set({ snippetSortMode: mode, snippets: get().sortSnippets(get().snippets, mode) });
  },

  toggleSnippetPin: async (id) => {
    // OPTIMISTIC UPDATE: Instant UI response, DB sync follows
    set(state => ({
      snippets: state.sortSnippets(
        state.snippets.map(s => s.id === id ? { ...s, isPinned: !s.isPinned } : s),
        state.snippetSortMode
      )
    }));
    const latestSnippet = get().snippets.find(s => s.id === id);
    if (latestSnippet) await get().saveSnippet(latestSnippet);
  },

  setSnippetRating: async (id, rating) => {
    // OPTIMISTIC UPDATE: Instant UI response, DB sync follows
    set(state => ({
      snippets: state.sortSnippets(
        state.snippets.map(s => s.id === id ? { ...s, rating } : s),
        state.snippetSortMode
      )
    }));
    const latestSnippet = get().snippets.find(s => s.id === id);
    if (latestSnippet) await get().saveSnippet(latestSnippet);
  },

  incrementSnippetUsage: async (id) => {
    const current = get().snippets;
    const item = current.find(s => s.id === id);
    if (item) {
      const updated = { ...item, usageCount: (item.usageCount || 0) + 1 };
      await get().saveSnippet(updated);
    }
  },

  deleteSnippet: async (id) => {
    await dbAPI.deleteSnippet(id);
    set(state => ({
      snippets: state.snippets.filter(s => s.id !== id),
      activeSnippetId: state.activeSnippetId === id ? null : state.activeSnippetId
    }));
  },

  // --- CONVERSION (Zero-Regression Data Transform) ---
  convertSnippetToPrompt: async (snippetId) => {
    const snippet = get().snippets.find(s => s.id === snippetId);
    if (!snippet) return null;

    const newPromptId = crypto.randomUUID();
    const newStepId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const newPrompt = {
      id: newPromptId,
      title: snippet.name,
      content: snippet.content,
      tags: [...(snippet.tags || [])],
      collectionId: snippet.collectionId || null,
      isPinned: false,
      rating: 0,
      ignoredVariables: [],
      presets: {},
      updatedAt: timestamp,
      createdAt: timestamp,
      usageCount: 0,
      chain: [{
        id: newStepId,
        title: "Main Prompt",
        content: snippet.content,
        notes: snippet.notes || "",
        isVisible: true,
        autoSnapshotReady: false,
        versions: [{
          id: crypto.randomUUID(),
          timestamp: timestamp,
          content: snippet.content,
          note: `Converted from Snippet`
        }]
      }]
    };

    await get().savePrompt(newPrompt);
    return newPromptId;
  },

  convertStepToSnippet: async (promptId, stepId) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt || !prompt.chain) return null;

    const step = prompt.chain.find(s => s.id === stepId);
    if (!step) return null;

    const newSnippetId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const rawName = `${prompt.title} - ${step.title || 'Step'}`;
    const safeName = rawName.replace(/[^a-zA-Z0-9_ \-]/g, '').trim();

    let finalName = safeName;
    let counter = 1;
    while (get().snippets.some(s => s.name === finalName)) {
      finalName = `${safeName} ${counter}`;
      counter++;
    }

    const newSnippet = {
      id: newSnippetId,
      name: finalName,
      content: step.content,
      notes: step.notes || "",
      tags: [...(prompt.tags || [])],
      collectionId: prompt.collectionId || null,
      isPinned: false,
      rating: 0,
      usageCount: 0,
      updatedAt: timestamp,
      createdAt: timestamp,
      versions: [{
        id: crypto.randomUUID(),
        timestamp: timestamp,
        content: step.content,
        note: `Converted from Prompt Step`
      }]
    };

    await get().saveSnippet(newSnippet, false);
    return newSnippetId;
  },
  // --- END CONVERSION ---

  setActiveSnippet: (id) => {
    set({ activeSnippetId: id });
  },

  checkSnippetUsage: (snippetName) => {
    const prompts = get().prompts || [];
    if (!snippetName) return [];

    try {
      const escapedName = escapeRegExp(snippetName);
      // Match @{Name} OR @Name (if not followed by more word characters)
      const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'i');
      return prompts.filter(p => {
        if (!p) return false;
        if (regex.test(p.content || "")) return true;
        if (p.chain && p.chain.some(step => step && regex.test(step.content || ""))) return true;
        return false;
      });
    } catch (e) {
      console.warn("Error checking snippet usage:", e);
      return [];
    }
  },

  /**
   * Efficiently checks usage for multiple snippets at once.
   * Returns a map of snippetId -> affectedPromptIds[]
   */
  checkBulkSnippetUsage: (ids) => {
    const prompts = get().prompts || [];
    const snippets = get().snippets || [];
    const targets = snippets.filter(s => ids.includes(s.id));
    const results = {};

    targets.forEach(s => {
      const escapedName = escapeRegExp(s.name);
      const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'i');
      const affected = prompts.filter(p => {
        if (!p) return false;
        if (regex.test(p.content || "")) return true;
        if (p.chain && p.chain.some(step => step && regex.test(step.content || ""))) return true;
        return false;
      }).map(p => p.id);

      if (affected.length > 0) results[s.id] = affected;
    });

    return results;
  },

  inlineSnippetInPrompts: async (snippetName, snippetContent) => {
    const prompts = get().prompts;
    const escapedName = escapeRegExp(snippetName);
    const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'gi');

    const updatedPrompts = prompts.map(p => {
      let hasChanges = false;
      let newContent = p.content;

      if (regex.test(newContent)) {
        newContent = newContent.replace(regex, snippetContent);
        hasChanges = true;
      }

      const newChain = p.chain.map(step => {
        if (regex.test(step.content)) {
          hasChanges = true;
          return { ...step, content: step.content.replace(regex, snippetContent) };
        }
        return step;
      });

      if (hasChanges) {
        return { ...p, content: newContent, chain: newChain, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    const changes = updatedPrompts.filter((p, i) => p !== prompts[i]);
    await dbAPI.bulkPutPrompts(changes);
    set({ prompts: updatedPrompts });
  },

  renameSnippetEverywhere: async (oldName, newName) => {
    // 1. Update Prompts
    await get().renameSnippetInPrompts(oldName, newName);

    // 2. Update Knowledge Tiles
    const tiles = get().knowledgeTiles;
    if (tiles && tiles.length > 0) {
      const escapedName = escapeRegExp(oldName);
      const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'gi');
      const replacement = `@{${newName}}`;

      const updatedTiles = [];
      for (const tile of tiles) {
        if (regex.test(tile.content || "")) {
          const updatedTile = {
            ...tile,
            content: tile.content.replace(regex, replacement),
            updatedAt: new Date().toISOString()
          };
          updatedTiles.push(updatedTile);
          await dbAPI.saveKnowledge(updatedTile);
        }
      }

      if (updatedTiles.length > 0) {
        const currentTiles = get().knowledgeTiles;
        const tileMap = new Map(updatedTiles.map(t => [t.id, t]));
        set({ knowledgeTiles: currentTiles.map(t => tileMap.has(t.id) ? tileMap.get(t.id) : t) });
      }
    }

    // Full sync to ensure all UIs are consistent
    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
  },

  renameSnippetInPrompts: async (oldName, newName) => {
    const prompts = get().prompts;
    const escapedName = escapeRegExp(oldName);
    const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'gi');

    const updatedPrompts = prompts.map(p => {
      let hasChanges = false;
      // Use standard @{NewName} format for safety
      const replacement = `@{${newName}}`;

      let newContent = p.content;
      if (regex.test(newContent)) {
        newContent = newContent.replace(regex, replacement);
        hasChanges = true;
      }

      const newChain = p.chain.map(step => {
        if (regex.test(step.content || "")) {
          hasChanges = true;
          return { ...step, content: step.content.replace(regex, replacement) };
        }
        return step;
      });

      if (hasChanges) {
        return { ...p, content: newContent, chain: newChain, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    const changes = updatedPrompts.filter((p, i) => p !== prompts[i]);
    await dbAPI.bulkPutPrompts(changes);
    set({ prompts: updatedPrompts });
  },

  removeSnippetRefsFromPrompts: async (snippetName) => {
    const prompts = get().prompts;
    const escapedName = escapeRegExp(snippetName);
    const regex = new RegExp(`@\\{${escapedName}\\}|@${escapedName}(?!\\w)`, 'gi');

    const updatedPrompts = prompts.map(p => {
      let hasChanges = false;

      let newContent = p.content;
      if (regex.test(newContent)) {
        newContent = newContent.replace(regex, ""); // Remove it
        hasChanges = true;
      }

      const newChain = p.chain.map(step => {
        if (regex.test(step.content || "")) {
          hasChanges = true;
          return { ...step, content: step.content.replace(regex, "") };
        }
        return step;
      });

      if (hasChanges) {
        return { ...p, content: newContent, chain: newChain, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    const changes = updatedPrompts.filter((p, i) => p !== prompts[i]);
    await dbAPI.bulkPutPrompts(changes);
    set({ prompts: updatedPrompts });
  },

  // --- SETTINGS & LLMS ---
  updateLlms: (newLlms) => {
    set({ llms: newLlms });
    chrome.storage.local.set({ custom_llms: newLlms });
  },

  resetLlms: () => {
    set({ llms: DEFAULT_LLMS });
    chrome.storage.local.set({ custom_llms: DEFAULT_LLMS });
  },

  updateSettings: (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    chrome.storage.local.set({ lp_settings: updated });
  },

  // --- COLLECTIONS ---
  saveCollection: async (collection) => {
    const timestamp = new Date().toISOString();
    const newCollection = {
      id: collection.id || crypto.randomUUID(),
      name: collection.name || 'Untitled Collection',
      description: collection.description || '',
      createdAt: collection.createdAt || timestamp,
      updatedAt: timestamp,
      color: collection.color || '#6366f1', // Default primary color
      colorOpacity: collection.colorOpacity != null ? collection.colorOpacity : 0.08 // Default tint intensity
    };

    await dbAPI.saveCollection(newCollection);
    const collections = await dbAPI.getAllCollections();
    set({ collections });
    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
    return newCollection;
  },

  deleteCollection: async (id) => {
    await dbAPI.deleteCollection(id);
    const collections = await dbAPI.getAllCollections();

    // 1. Nur die tatsächlich von der Löschung betroffenen Datensätze ermitteln
    const promptsToUpdate = get().prompts.filter(p => p.collectionId === id);
    const snippetsToUpdate = get().snippets.filter(s => s.collectionId === id);
    const tilesToUpdate = get().knowledgeTiles.filter(t => t.collectionId === id);

    // 2. Zustand im Arbeitsspeicher (Zustand-Store) unverändert aktualisieren
    const updatedPrompts = get().prompts.map(p =>
      p.collectionId === id ? { ...p, collectionId: null } : p
    );
    const updatedSnippets = get().snippets.map(s =>
      s.collectionId === id ? { ...s, collectionId: null } : s
    );
    const updatedKnowledge = get().knowledgeTiles.map(t =>
      t.collectionId === id ? { ...t, collectionId: null } : t
    );

    // 3. Ausschließlich mutierte Datensätze persistieren (I/O-Schutz)
    const promises = [];
    if (promptsToUpdate.length > 0) {
      promises.push(dbAPI.bulkPutPrompts(promptsToUpdate.map(p => ({ ...p, collectionId: null }))));
    }
    if (snippetsToUpdate.length > 0) {
      promises.push(dbAPI.bulkPutSnippets(snippetsToUpdate.map(s => ({ ...s, collectionId: null }))));
    }
    if (tilesToUpdate.length > 0) {
      promises.push(dbAPI.bulkPutKnowledge(tilesToUpdate.map(t => ({ ...t, collectionId: null }))));
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }

    set({
      collections,
      prompts: updatedPrompts,
      snippets: updatedSnippets,
      knowledgeTiles: updatedKnowledge,
      activeCollectionId: get().activeCollectionId === id ? null : get().activeCollectionId
    });

    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
  },

  setActiveCollection: (id) => {
    set({ activeCollectionId: id });
  },

  assignToCollection: async (promptId, collectionId) => {
    const prompt = get().prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const updated = { ...prompt, collectionId };
    await get().savePrompt(updated);
  },

  // --- BULK ACTIONS (Prompts) ---
  bulkAssignPromptsToCollection: async (ids, collectionId) => {
    const promptsToUpdate = get().prompts.filter(p => ids.includes(p.id));
    // Optimistic update in state
    const currentPrompts = get().prompts;
    const newPrompts = currentPrompts.map(p =>
      ids.includes(p.id) ? { ...p, collectionId } : p
    );
    set({ prompts: newPrompts });

    // Persist
    await dbAPI.bulkPutPrompts(promptsToUpdate.map(p => ({ ...p, collectionId })));
  },

  bulkUpdatePromptTags: async (ids, tags, mode = 'append') => {
    const promptsToUpdate = get().prompts.filter(p => ids.includes(p.id));

    // Calculate new states
    const updates = promptsToUpdate.map(p => {
      let newTags;
      if (mode === 'replace') {
        newTags = tags;
      } else if (mode === 'remove') {
        newTags = (p.tags || []).filter(t => !tags.includes(t));
      } else {
        // Append: Merge and dedup
        newTags = [...new Set([...(p.tags || []), ...tags])];
      }
      return { ...p, tags: newTags };
    });

    // Update State
    const currentPrompts = get().prompts;
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const newPrompts = currentPrompts.map(p => updateMap.has(p.id) ? updateMap.get(p.id) : p);
    set({ prompts: newPrompts });

    // Persist
    await dbAPI.bulkPutPrompts(updates);
  },

  // --- BULK ACTIONS (Snippets) ---
  bulkAssignSnippetsToCollection: async (ids, collectionId) => {
    const snippetsToUpdate = get().snippets.filter(s => ids.includes(s.id));
    // Optimistic update
    const currentSnippets = get().snippets;
    const newSnippets = currentSnippets.map(s =>
      ids.includes(s.id) ? { ...s, collectionId } : s
    );
    set({ snippets: newSnippets });

    // Persist
    await dbAPI.bulkPutSnippets(snippetsToUpdate.map(s => ({ ...s, collectionId })));
  },

  bulkUpdateSnippetTags: async (ids, tags, mode = 'append') => {
    const snippetsToUpdate = get().snippets.filter(s => ids.includes(s.id));

    const updates = snippetsToUpdate.map(s => {
      let newTags;
      if (mode === 'replace') {
        newTags = tags;
      } else if (mode === 'remove') {
        newTags = (s.tags || []).filter(t => !tags.includes(t));
      } else {
        newTags = [...new Set([...(s.tags || []), ...tags])];
      }
      return { ...s, tags: newTags };
    });

    const currentSnippets = get().snippets;
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const newSnippets = currentSnippets.map(s => updateMap.has(s.id) ? updateMap.get(s.id) : s);
    set({ snippets: newSnippets });

    await dbAPI.bulkPutSnippets(updates);
  },

  bulkDeleteSnippets: async (ids) => {
    // 1. Persist to DB
    await Promise.all(ids.map(id => dbAPI.deleteSnippet(id)));

    // 2. Update State
    const currentSnippets = get().snippets;
    set({
      snippets: currentSnippets.filter(s => !ids.includes(s.id)),
      activeSnippetId: ids.includes(get().activeSnippetId) ? null : get().activeSnippetId
    });

    // 3. Optional: Trigger menu refresh if needed
    // chrome.runtime.sendMessage({ action: "REFRESH_MENU" });
  },

  deleteTag: async (tagName) => {
    // 1. Prompts
    const prompts = get().prompts;
    const promptsToUpdate = prompts.filter(p => p.tags && p.tags.includes(tagName));
    const newPrompts = prompts.map(p => {
      if (p.tags && p.tags.includes(tagName)) {
        return { ...p, tags: p.tags.filter(t => t !== tagName) };
      }
      return p;
    });

    // 2. Snippets
    const snippets = get().snippets;
    const snippetsToUpdate = snippets.filter(s => s.tags && s.tags.includes(tagName));
    const newSnippets = snippets.map(s => {
      if (s.tags && s.tags.includes(tagName)) {
        return { ...s, tags: s.tags.filter(t => t !== tagName) };
      }
      return s;
    });

    // 3. Knowledge Tiles
    const tiles = get().knowledgeTiles;
    const tilesToUpdate = tiles.filter(t => t.tags && t.tags.includes(tagName));
    const newTiles = tiles.map(t => {
      if (t.tags && t.tags.includes(tagName)) {
        return { ...t, tags: t.tags.filter(tag => tag !== tagName) };
      }
      return t;
    });

    // Optimistic Update (single atomic state change for all 3 domains)
    set({ prompts: newPrompts, snippets: newSnippets, knowledgeTiles: newTiles });

    // Persist (parallel writes to IndexedDB using atomic bulk transactions)
    await Promise.all([
      dbAPI.bulkPutPrompts(promptsToUpdate.map(p => ({ ...p, tags: p.tags.filter(t => t !== tagName) }))),
      dbAPI.bulkPutSnippets(snippetsToUpdate.map(s => ({ ...s, tags: s.tags.filter(t => t !== tagName) }))),
      dbAPI.bulkPutKnowledge(tilesToUpdate.map(t => ({ ...t, tags: t.tags.filter(tag => tag !== tagName) })))
    ]);
  },

  renameTag: async (oldTag, newTag) => {
    // 1. Prompts
    const prompts = get().prompts;
    const promptsToUpdate = prompts.filter(p => p.tags && p.tags.includes(oldTag));
    const newPrompts = prompts.map(p => {
      if (p.tags && p.tags.includes(oldTag)) {
        const otherTags = p.tags.filter(t => t !== oldTag);
        return { ...p, tags: [...new Set([...otherTags, newTag])] };
      }
      return p;
    });

    // 2. Snippets
    const snippets = get().snippets;
    const snippetsToUpdate = snippets.filter(s => s.tags && s.tags.includes(oldTag));
    const newSnippets = snippets.map(s => {
      if (s.tags && s.tags.includes(oldTag)) {
        const otherTags = s.tags.filter(t => t !== oldTag);
        return { ...s, tags: [...new Set([...otherTags, newTag])] };
      }
      return s;
    });

    // Optimistic Update
    set({ prompts: newPrompts, snippets: newSnippets });

    // Persist using atomic bulk transactions
    await Promise.all([
      dbAPI.bulkPutPrompts(promptsToUpdate.map(p => {
        const otherTags = (p.tags || []).filter(t => t !== oldTag);
        return { ...p, tags: [...new Set([...otherTags, newTag])] };
      })),
      dbAPI.bulkPutSnippets(snippetsToUpdate.map(s => {
        const otherTags = (s.tags || []).filter(t => t !== oldTag);
        return { ...s, tags: [...new Set([...otherTags, newTag])] };
      }))
    ]);
  },

  // --- KNOWLEDGE BASE ---
  saveKnowledgeTile: async (tile) => {
    const timestamp = new Date().toISOString();
    const finalTile = {
      ...tile,
      updatedAt: timestamp,
      createdAt: tile.createdAt || timestamp
    };

    const previousTiles = get().knowledgeTiles;

    // LÖSUNG 1: Optimistic UI Update
    set(state => {
      const exists = state.knowledgeTiles.find(t => t.id === finalTile.id);
      return {
        knowledgeTiles: exists
          ? state.knowledgeTiles.map(t => t.id === finalTile.id ? finalTile : t)
          : [finalTile, ...state.knowledgeTiles]
      };
    });

    // DANN asynchron in DB mit Rollback-Sicherung
    try {
      await dbAPI.saveKnowledge(finalTile);
    } catch (error) {
      console.error("LeanPrompts: Knowledge database write failed. Rolling back UI.", error);
      await get().loadPrompts();
      throw new Error("Failed to save knowledge tile to database. Quota exceeded or internal error.");
    }
  },

  deleteKnowledgeTile: async (id) => {
    await dbAPI.deleteKnowledge(id);
    set(state => ({ knowledgeTiles: state.knowledgeTiles.filter(t => t.id !== id) }));
  },

  bulkDeleteKnowledgeTiles: async (ids) => {
    await dbAPI.bulkDeleteKnowledge(ids);
    set(state => ({ knowledgeTiles: state.knowledgeTiles.filter(t => !ids.includes(t.id)) }));
  },

  // --- FACTORY RESET (DELETE ALL) ---
  factoryReset: async () => {
    // 1. Clear all IndexedDB stores
    await dbAPI.clearAllData();

    // 2. Clear chrome.storage.local keys
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove([
        'custom_llms',
        'lp_settings',
        'lp_onboarding_popup_done',
        'lp_onboarding_dashboard_done',
        'lp_theme',
        'lp_saved_drafts',
        'lp_quick_prompt_draft',
        'lp_recent_prompts',
        'lp_last_session',
        'lp_popup_nav',
        'lp_import_in_progress',
        'lp_keep_values'
      ]);
    }

    // Set active selection states to null to prevent phantom draft re-injection
    set({
      activePromptId: null,
      activeSnippetId: null,
      activeCollectionId: null,
    });

    // 3. Re-seed the onboarding / tutorial data
    await dbAPI.seedIfEmpty(SEED_PROMPTS, SEED_SNIPPETS);

    // 4. Persist the default LLMs
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ custom_llms: DEFAULT_LLMS });
    }

    // 5. Reload everything from the freshly seeded DB into Zustand
    await get().loadPrompts();

    // 6. Sync to other tabs
    if (get()._syncChannel) get()._syncChannel.postMessage('RELOAD_DATA');
    chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
  }
}));

// Add listener for external storage changes (e.g. from context menu)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.custom_llms) {
      usePromptStore.setState({ llms: changes.custom_llms.newValue || [] });
    }
    if (area === 'local' && changes.lp_settings) {
      usePromptStore.setState({
        settings: { ...DEFAULT_SETTINGS, ...changes.lp_settings.newValue }
      });
    }
  });
}

export default usePromptStore;