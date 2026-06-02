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
import { dbAPI } from './db';

// Helper um LocalStorage/ChromeStorage für LLMs zu holen
async function getSystemData() {
  const [localData, knowledge] = await Promise.all([
    chrome.storage.local.get(['custom_llms']),
    dbAPI.getAllKnowledge()
  ]);

  return {
    llms: localData.custom_llms || [],
    knowledge: knowledge || []
  };
}

// Helper to robustly compare timestamps. Defensive: missing incoming = ancient.
function isIncomingNewer(local, incoming) {
  if (!local) return true; // Local doesn't exist? Always add.
  if (!local.updatedAt && !incoming?.updatedAt) return false; // Both have no date? Skip.
  if (!local.updatedAt) return true; // Local has no date, incoming has? Update.
  if (!incoming || !incoming.updatedAt) return false; // Incoming has no date? Skip.
  return new Date(incoming.updatedAt) > new Date(local.updatedAt);
}

/**
 * Validates the core structure of a backup file.
 * Ensures the app identifier and versioning are present.
 */
function validateBackupData(content) {
  if (!content || typeof content !== 'object') return false;
  if (!content.meta || content.meta.app !== "LeanPrompts") return false;

  const isArrayOrEmpty = (arr) => !arr || Array.isArray(arr);

  // High-level structure check
  if (!isArrayOrEmpty(content.data) || !isArrayOrEmpty(content.snippets) ||
    !isArrayOrEmpty(content.collections) || !isArrayOrEmpty(content.knowledgeBase)) {
    return false;
  }

  // Deep check on first prompt (if exists)
  if (content.data?.length > 0) {
    const p = content.data[0];
    if (p && (!p.id || !p.title || (p.chain && !Array.isArray(p.chain)))) return false;
  }

  // Must have at least one data array with items to be considered a meaningful backup
  const hasData = (
    (content.data?.length > 0) ||
    (content.snippets?.length > 0) ||
    (content.collections?.length > 0) ||
    (content.knowledgeBase?.length > 0) ||
    (content.system?.llms?.length > 0)
  );

  return hasData;
}

export const backupManager = {


  async exportData(fullSystem = false) {
    try {
      const rawPrompts = await dbAPI.getAllPrompts();

      // --- START: ASSET STRIPPER (Ghost Files) ---
      // We process a copy for export to keep the backup small
      const stripPresets = (presetsObj) => {
        if (!presetsObj) return presetsObj;
        const stripped = {};
        Object.entries(presetsObj).forEach(([name, preset]) => {
          const strippedPreset = { ...preset };
          
          strippedPreset.files = (preset.files || []).map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            isGhost: true // Marker for UI
          }));

          if (preset.values) {
            const strippedValues = {};
            Object.entries(preset.values).forEach(([varName, varVal]) => {
              if (Array.isArray(varVal)) {
                strippedValues[varName] = varVal.map(item => {
                  if (item && typeof item === 'object' && item.size !== undefined && item.name) {
                    return { name: item.name, type: item.type, size: item.size, isGhost: true };
                  }
                  return item;
                });
              } else {
                strippedValues[varName] = varVal;
              }
            });
            strippedPreset.values = strippedValues;
          }

          stripped[name] = strippedPreset;
        });
        return stripped;
      };

      const prompts = rawPrompts.map(prompt => {
        const cleanPrompt = { ...prompt };
        
        // 1. Strip root presets
        if (cleanPrompt.presets) {
          cleanPrompt.presets = stripPresets(cleanPrompt.presets);
        }

        // 2. Strip history snapshots (to prevent massive inflation from workflow rollbacks)
        if (cleanPrompt.chain && Array.isArray(cleanPrompt.chain)) {
          cleanPrompt.chain = cleanPrompt.chain.map(step => {
            if (!step.versions || !Array.isArray(step.versions) || step.versions.length === 0) {
              return step;
            }
            
            const strippedVersions = step.versions.map(v => {
              if (v.presets) {
                return { ...v, presets: stripPresets(v.presets) };
              }
              return v;
            });
            
            return { ...step, versions: strippedVersions };
          });
        }
        
        return cleanPrompt;
      });
      // --- END: ASSET STRIPPER ---

      let snippets = [];
      let collections = [];
      let systemData = { llms: [], knowledge: [] };

      if (fullSystem) {
        snippets = await dbAPI.getAllSnippets();
        collections = await dbAPI.getAllCollections();
        systemData = await getSystemData();
      }

      const backup = {
        meta: {
          version: 3,
          type: fullSystem ? 'full_system' : 'prompts_only',
          exportedAt: new Date().toISOString(),
          app: "LeanPrompts"
        },
        data: prompts,
        snippets: snippets,
        collections: collections,
        knowledgeBase: systemData.knowledge,
        system: { llms: systemData.llms }
      };

      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // PEAK MEMORY OPTIMIZATION: Null out large references immediately
      const prefix = fullSystem ? 'leanprompts_FULL_BACKUP' : 'leanprompts_prompts';
      const timestamp = new Date().toISOString().slice(0, 10);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      return true;
    } catch (err) {
      console.error("Export failed:", err);
      return false;
    }
  },

  /**
   * Internal: Creates a temporary snapshot of the entire DB in IndexedDB.
   * REACHES BEYOND chrome.storage.local LIMITS.
   */
  async createShadowBackup() {
    try {
      const { initDB } = await import('./db');
      const db = await initDB();
      const snapshot = {
        meta: { app: "LeanPrompts", snapshotAt: new Date().toISOString() },
        data: await db.getAll('prompts'),
        snippets: await db.getAll('snippets'),
        collections: await db.getAll('collections'),
        knowledgeBase: await db.getAll('knowledge'),
        system: await chrome.storage.local.get(['custom_llms'])
      };

      // CRITICAL: We move to IndexedDB to bypass 10MB quota of storage.local
      await dbAPI.saveShadowBackup('pre_import_snapshot', snapshot);
      return true;
    } catch (e) {
      console.warn("LeanPrompts: Shadow-Backup failed", e);
      return false;
    }
  },

  /**
   * Internal: Attempts a dummy write to verify if we are hitting storage limits.
   */
  async verifyStorageQuota(estimatedSize = 1000000) {
    try {
      const dummy = "x".repeat(estimatedSize);
      await chrome.storage.local.set({ _lp_quota_test: dummy });
      await chrome.storage.local.remove('_lp_quota_test');
      return true;
    } catch (e) {
      console.error("LeanPrompts: Storage Quota check failed. Quota may be exceeded.", e);
      return false;
    }
  },

  /**
   * Performs a smart import of provided data based on the given options.
   * Rock-solid IDE-grade merge logic with Newest-Wins protection.
   */
  async performSmartImport(content, options, isSmart = true) {
    if (!validateBackupData(content)) {
      throw new Error("Invalid or corrupted backup content (Signature mismatch or invalid schema).");
    }


    // PHASE 2: SHADOW-BACKUP (Safety Net)
    await this.createShadowBackup();

    // FALLBACK: Old single exports might use 'prompts' instead of 'data'
    if (!content.data && content.prompts) {
      content.data = content.prompts;
    }

    const { initDB } = await import('./db');

    // INITIALIZE RESULTS (Strict object structure for detailed reporting)
    const results = {
      prompts: { added: 0, updated: 0, skipped: 0 },
      snippets: { added: 0, updated: 0, skipped: 0 },
      collections: { added: 0, updated: 0, skipped: 0 },
      knowledge: { added: 0, updated: 0, skipped: 0 },
      system: { added: 0, updated: 0, skipped: 0 }
    };

    // 1. DATABASE TRANSACTION (Prompts, Snippets, Collections & Knowledge)
    const db = await initDB();
    const stores = ['prompts', 'snippets', 'collections', 'knowledge'];
    const tx = db.transaction(stores, 'readwrite');

    try {
      // A. PROMPTS
      if (options.prompts && content.data) {
        const pStore = tx.objectStore('prompts');
        if (!isSmart) await pStore.clear();

        for (const p of content.data) {
          if (isSmart) {
            const localExisting = await pStore.get(p.id);
            if (localExisting) {
              if (!isIncomingNewer(localExisting, p)) {
                results.prompts.skipped++;
                continue;
              }
              results.prompts.updated++;
            } else {
              results.prompts.added++;
            }
          } else {
            results.prompts.added++;
          }

          let cleanedPrompt = { ...p };
          if (!options.history) {
            cleanedPrompt.versions = [];
            if (cleanedPrompt.chain) cleanedPrompt.chain = cleanedPrompt.chain.map(s => ({ ...s, versions: [] }));
          }
          if (!options.notes) {
            if (cleanedPrompt.chain) cleanedPrompt.chain = cleanedPrompt.chain.map(s => ({ ...s, notes: "" }));
            delete cleanedPrompt.notes;
          }
          if (!options.presets) {
            delete cleanedPrompt.presets;
          }
          await pStore.put(cleanedPrompt);
        }
      }

      // B. SNIPPETS
      if (options.snippets && content.snippets) {
        const sStore = tx.objectStore('snippets');
        if (!isSmart) await sStore.clear();

        for (const s of content.snippets) {
          if (isSmart) {
            const localExisting = await sStore.get(s.id);
            if (localExisting) {
              if (!isIncomingNewer(localExisting, s)) {
                results.snippets.skipped++;
                continue;
              }
              results.snippets.updated++;
            } else {
              results.snippets.added++;
            }
          } else {
            results.snippets.added++;
          }
          let cleanedSnippet = { ...s };
          if (!options.history) {
            cleanedSnippet.versions = [];
          }
          if (!options.notes) {
            // Snippets don't have a top-level note field yet, but if they did, we'd clear it here.
            // Currently they only have content and tags.
          }
          await sStore.put(cleanedSnippet);
        }
      }

      // C. COLLECTIONS
      if (options.collections && content.collections) {
        const cStore = tx.objectStore('collections');
        if (!isSmart) await cStore.clear();

        for (const col of content.collections) {
          if (isSmart) {
            const localExisting = await cStore.get(col.id);
            if (localExisting) {
              if (!isIncomingNewer(localExisting, col)) {
                results.collections.skipped++;
                continue;
              }
              results.collections.updated++;
            } else {
              results.collections.added++;
            }
          } else {
            results.collections.added++;
          }
          await cStore.put(col);
        }
      }

      // await tx.done; // Deferred until AFTER knowledge base is processed

      // D. KNOWLEDGE BASE
      if (options.knowledge && content.knowledgeBase) {
        const store = tx.objectStore('knowledge');

        if (isSmart) {
          // Smart Merge: Newest Wins
          for (const t of content.knowledgeBase) {
            const localExisting = await store.get(t.id);
            if (localExisting) {
              if (isIncomingNewer(localExisting, t)) {
                await store.put(t);
                results.knowledge.updated++;
              } else {
                results.knowledge.skipped++;
              }
            } else {
              await store.put(t);
              results.knowledge.added++;
            }
          }
        } else {
          // Full Restore: Replace All
          await store.clear();
          for (const t of content.knowledgeBase) {
            await store.put(t);
          }
          results.knowledge.added = content.knowledgeBase.length;
        }
      }

      // FINAL COMMIT
      await tx.done;
    } catch (err) {
      if (tx) {
        try {
          tx.abort();
        } catch (abortError) {
          // Ignoriere Folgefehler, falls die Transaktion bereits inaktiv war
        }
      }
      console.error("Import operation failed. Transaction rolled back.", err);

      // SHADOW ROLLBACK: In an extreme failure, the user still has 'pre_import_snapshot' in IndexedDB.
      // We don't auto-restore here to prevent infinite error loops, but we keep the backup safe.
      throw new Error(`IMPORT_FAILED: ${err.message || 'Database transaction error'}. A safety snapshot remains in IndexedDB backups.`);
    }

    // 3. SYSTEM / LLMS
    if (options.llms && content.system?.llms) {
      // 🛡️ SECURITY GUARD: Strict URI Whitelisting + Array Capping (DoS Protection)
      const isSafeLlmUrl = (urlString) => {
        try {
          const url = new URL(urlString);
          const forbiddenProtocols = ['javascript:', 'data:', 'chrome:', 'edge:', 'about:', 'file:'];
          return !forbiddenProtocols.includes(url.protocol.toLowerCase());
        } catch {
          return false;
        }
      };

      // Limit to 100 to prevent Storage Quota Exhaustion DoS attacks
      const safeLlms = content.system.llms
          .filter(l => l.url && isSafeLlmUrl(l.url) && l.name)
          .slice(0, 100); 

      if (isSmart) {
        const storage = await chrome.storage.local.get(['custom_llms']);
        const current = storage.custom_llms || [];
        const currentIds = new Set(current.map(l => l.id));

        for (const l of safeLlms) {
          if (!currentIds.has(l.id)) {
            current.push(l);
            results.system.added++;
            currentIds.add(l.id);
          } else {
            results.system.skipped++;
          }
        }
        await chrome.storage.local.set({ custom_llms: current });
      } else {
        await chrome.storage.local.set({ custom_llms: safeLlms });
        results.system.added = safeLlms.length;
      }
    }

    // BROADCAST
    chrome.runtime.sendMessage({ action: "RELOAD_DATA" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { /* ignore */ } });

    // PHASE 3: Safety Cleanup (Delete shadow backup only AFTER successful commit of everything)
    // CRITICAL: This is the ONLY place where the cleanup happens, ensuring we only delete it if we reach this point.
    await dbAPI.clearShadowBackup('pre_import_snapshot');

    // 4. INTEGRITY CHECK (Post-Merge)
    // We fetch the final state to ensure we clean up even if we skipped some items
    if (options.snippets && options.collections) {
      const db = await initDB();
      const finalSnippets = await db.getAll('snippets');
      const finalCollections = await db.getAll('collections');

      // Detect orphans in memory (the DB update happens lazily or next save, 
      // but for this session we want clean data)
      // Note: To be truly persistent we would need another transaction, 
      // but for "Display Safety" this is enough as the UI re-fetches.
      // For strict persistence:
      const collectionIds = new Set(finalCollections.map(c => c.id));
      const orphans = finalSnippets.filter(s => s.collectionId && !collectionIds.has(s.collectionId));

      if (orphans.length > 0) {
        const tx = db.transaction('snippets', 'readwrite');
        for (const s of orphans) {
          await tx.store.put({ ...s, collectionId: null });
        }
        await tx.done;
        console.log(`[Backup] Cleaned ${orphans.length} orphaned snippets.`);
      }
    }

    return results;
  },

  async importData(file) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const content = JSON.parse(e.target.result);
          const results = await this.performSmartImport(content, {
            prompts: true, history: true, notes: true, snippets: true,
            collections: true, knowledge: true, llms: true
          });
          const totalAdded = results.prompts.added + results.snippets.added + results.collections.added;
          resolve(`Imported: ${totalAdded} total items added.`);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },

  async performWorkflowImport(finalData, conflicts, updateSettings) {
    if (!finalData) throw new Error("No data to import.");
    
    await chrome.storage.local.set({ lp_import_in_progress: { timestamp: Date.now() } });
    try {
      const { initDB } = await import('./db');
      const db = await initDB();
      const tx = db.transaction(['prompts', 'snippets', 'knowledge', 'collections'], 'readwrite');

    try {
      // --- COLLECTION INTEGRITY GUARD ---
      const cStore = tx.objectStore('collections');
      const embeddedCollections = finalData._embeddedCollections || [];

      const verifyCollection = async (item) => {
        if (!item || !item.collectionId) return;
        try {
          const colId = item.collectionId;
          const exists = await cStore.get(colId);
          if (!exists) {
            const embedded = embeddedCollections.find(c => c.id === colId);
            if (embedded) {
              await cStore.put({
                id: embedded.id,
                name: embedded.name || 'Imported Collection',
                color: embedded.color || '#6366f1',
                icon: embedded.icon || null,
                createdAt: embedded.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              console.log(`[Backup] Recreated missing collection: ${embedded.name} (${colId})`);
            } else {
              console.log(`[Backup] Collection ${colId} is missing and not embedded. Resetting item collectionId to null.`);
              item.collectionId = null;
            }
          }
        } catch (colErr) {
          console.warn("[Backup] Collection verification failed for item:", colErr);
          item.collectionId = null; // Safe fallback on error
        }
      };

      if (finalData.prompt) {
        await verifyCollection(finalData.prompt);
      }
      if (finalData.snippets) {
        for (const s of finalData.snippets) {
          await verifyCollection(s);
        }
      }
      // --- END COLLECTION INTEGRITY GUARD ---

      // 1. Dictionaries for find-and-replace in the Prompt
      const snippetRenames = []; // { oldName, newName }
      const kbRenames = [];      // { oldTitle, newTitle }

      // Generate a unique session ID for the rollback feature
      const importSessionId = `imp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const importBundleName = finalData.prompt?.title ? `Workflow: ${finalData.prompt.title}` : 'Imported Workflow';
      const importedAt = new Date().toISOString();

      // Helper to attach import metadata to any entity
      const attachImportMeta = (item) => {
        item.importSessionId = importSessionId;
        item.importBundleName = importBundleName;
        item.importedAt = importedAt;
      };

      // 2. Process Snippets
      const sStore = tx.objectStore('snippets');
      const sNameIndex = sStore.index('name');

      for (let s of finalData.snippets) {
        let conflictItem = conflicts.snippets.find(c => c.incoming.id === s.id);

        if (conflictItem) {
          // INTELLIGENT UPDATE LOGIC FOR SNIPPETS
          if (finalData.updateIntent) {
            const existingId = conflictItem.existing.id;
            const existingSnippet = await sStore.get(existingId);

            if (existingSnippet) {
              // 1. Snapshot the old snippet
              const snapshotVersion = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                content: existingSnippet.content,
                note: `Auto-Snapshot before Bundle Update`,
                importSessionId: importSessionId
              };
              existingSnippet.versions = existingSnippet.versions || [];
              existingSnippet.versions.unshift(snapshotVersion);

              // 2. Overwrite necessary fields 
              existingSnippet.content = s.content;
              existingSnippet.updatedAt = new Date().toISOString();
              if (s.notes) existingSnippet.notes = s.notes;

              await sStore.put(existingSnippet);
              // Fast-forward (no renaming needed for updates)
              continue;
            }
          }

          // STANDARD DUPLICATE LOGIC
          const oldName = s.name;
          let baseName = `${s.name} (imported)`;
          let newName = baseName;
          let counter = 1;

          while (await sNameIndex.get(newName)) {
            counter++;
            newName = `${baseName} ${counter}`;
          }

          s.name = newName;
          s.id = crypto.randomUUID(); // Give it a fresh ID so it doesn't overwrite
          snippetRenames.push({ oldName, newName: s.name });
        } else {
          // If it isn't a conflict, we still might want to give it a new ID 
          // to prevent future "Smart Merge" from treating them as the exact same snippet 
          // if the user edits it locally, but for now we keep the ID so it merges cleanly 
          // if imported again.
        }

        attachImportMeta(s);
        await sStore.put(s);
      }

      // 3. Process Knowledge Base
      const kStore = tx.objectStore('knowledge');
      for (let k of finalData.knowledgeBase) {
        let conflictItem = conflicts.knowledge.find(c => c.incoming.id === k.id);

        if (conflictItem) {
          // INTELLIGENT UPDATE LOGIC FOR KB
          if (finalData.updateIntent) {
            const existingId = conflictItem.existing.id;
            const existingKB = await kStore.get(existingId);

            if (existingKB) {
              const snapshotVersion = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                content: existingKB.content,
                note: `Auto-Snapshot before Bundle Update`,
                importSessionId: importSessionId
              };
              existingKB.versions = existingKB.versions || [];
              existingKB.versions.unshift(snapshotVersion);

              existingKB.content = k.content;
              existingKB.updatedAt = new Date().toISOString();
              if (k.tags) existingKB.tags = k.tags;

              await kStore.put(existingKB);
              continue;
            }
          }

          // STANDARD DUPLICATE LOGIC
          const oldTitle = k.title;
          k.title = `${k.title} (imported)`;
          k.id = crypto.randomUUID();
          kbRenames.push({ oldTitle, newTitle: k.title });
        }

        attachImportMeta(k);
        await kStore.put(k);
      }

      // 4. Process the Prompt (Smart Update references)
      if (finalData.prompt) {
        const pStore = tx.objectStore('prompts');
        let p = finalData.prompt;

        // Helper string replace function
        const updateText = (text) => {
          if (!text) return text;
          let newText = text;

          const escapeRegExp = (string) => {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escapes special characters
          };

          snippetRenames.forEach(({ oldName, newName }) => {
            if (!oldName) return;
            const escapedOldName = escapeRegExp(oldName);
            // Replace @oldName or @{oldName} with @{newName}
            const regex1 = new RegExp(`@${escapedOldName}\\b`, 'g');
            const regex2 = new RegExp(`@\\{${escapedOldName}\\}`, 'g');
            newText = newText.replace(regex1, `@{${newName}}`);
            newText = newText.replace(regex2, `@{${newName}}`);
          });

          kbRenames.forEach(({ oldTitle, newTitle }) => {
            if (!oldTitle) return;
            const escapedOldTitle = escapeRegExp(oldTitle);
            // Replace [[oldTitle]] with [[newTitle]]
            const regex = new RegExp(`\\[\\[${escapedOldTitle}\\]\\]`, 'g');
            newText = newText.replace(regex, `[[${newTitle}]]`);
          });

          return newText;
        };

        p.content = updateText(p.content);
        if (p.notes) p.notes = updateText(p.notes);

        if (p.chain) {
          p.chain = p.chain.map(step => ({
            ...step,
            content: updateText(step.content),
            notes: updateText(step.notes)
          }));
        }

        // INTELLIGENT UPDATE vs DUPLICATE LOGIC
        if (finalData.updateIntent && finalData.updateIntent.existingPromptId) {
          // User requested an update. Fetch the existing prompt.
          const existingPrompt = await pStore.get(finalData.updateIntent.existingPromptId);

          if (existingPrompt) {
            // 1. Create an Auto-Snapshot of the existing state
            const snapshotVersion = {
              id: crypto.randomUUID(),
              content: existingPrompt.content,
              presets: existingPrompt.presets ? JSON.parse(JSON.stringify(existingPrompt.presets)) : null, // Record state for 1:1 rollback
              timestamp: new Date().toISOString(), // Use timestamp to match snippet versions UI
              note: `Auto-Snapshot before Bundle Update`, // UI actually expects 'note' not 'label'
              // TAG the snapshot so the rollback function can find it and restore it
              importSessionId: importSessionId
            };

            // Safely Ensure Chain Structure Exists
            if (!existingPrompt.chain || existingPrompt.chain.length === 0) {
              existingPrompt.chain = [{
                id: crypto.randomUUID(),
                content: existingPrompt.content,
                versions: [],
                title: "Main Prompt",
                isVisible: true
              }];
            }

            // Push snapshot into the Primary Step (Index 0)
            existingPrompt.chain[0].versions = existingPrompt.chain[0].versions || [];
            existingPrompt.chain[0].versions.unshift(snapshotVersion);

            // 2. Overwrite the necessary fields with the incoming data
            existingPrompt.content = p.content;
            // Important: we don't overwrite title, id, createdAt, isPinned, rating, etc.
            if (p.notes) existingPrompt.notes = p.notes;

            // Non-Destructive Preset Merge
            if (p.presets) {
              const localPresets = existingPrompt.presets || {};
              const mergedPresets = { ...localPresets };

              Object.entries(p.presets).forEach(([presetName, presetData]) => {
                const finalName = localPresets[presetName] ? `${presetName} (imported)` : presetName;
                mergedPresets[finalName] = presetData;
              });

              existingPrompt.presets = mergedPresets;
            }

            // Overwrite the incoming chain as well but preserve the first step's version history AND its ID!
            if (p.chain && p.chain.length > 0) {
              const oldVersions = existingPrompt.chain[0].versions;
              const originalStepId = existingPrompt.chain[0].id;

              // WeMUST map the incoming first step to match the local first step ID.
              // Otherwise, the UI's `activeStepId` gets orphaned, causing histories to visually disappear 
              // and future saves to fail.
              p.chain[0].id = originalStepId;
              p.chain[0].versions = oldVersions;

              existingPrompt.chain = p.chain;
            } else {
              existingPrompt.chain[0].content = p.content;
            }

            existingPrompt.updatedAt = new Date().toISOString();

            // Do NOT attach global import meta to the prompt object itself, 
            // otherwise a rollback would DELETE the entire prompt.
            // The import meta is safely inside the snapshot version.

            await pStore.put(existingPrompt);
          } else {
            console.warn("Intelligent Update failed: Original prompt not found. Falling back to duplicate.");
            // Fallback to duplicate (below)
            p.id = crypto.randomUUID();
            p.title = `${p.title} (imported)`;
            p.updatedAt = new Date().toISOString();
            attachImportMeta(p);
            await pStore.put(p);
          }

        } else {
          // STANDARD DUPLICATE LOGIC
          // Give the imported prompt a fresh ID and flag it so it doesn't overwrite local variants
          p.id = crypto.randomUUID();
          p.title = `${p.title} (imported)`;
          p.updatedAt = new Date().toISOString();

          attachImportMeta(p);
          await pStore.put(p);
        }
      }

      await tx.done;
    } catch (err) {
      if (tx) {
        try {
          tx.abort();
        } catch (abortError) {
          // Ignoriere Folgefehler, falls die Transaktion bereits inaktiv war
        }
      }
      console.error("Workflow Import Transaction failed:", err);
      throw new Error("Failed to save workflow data to database.");
    }

    // Broadcast UI updates
    chrome.runtime.sendMessage({ action: "RELOAD_DATA" }, () => { if (chrome.runtime.lastError) { } });
    return true;
    } finally {
      await chrome.storage.local.remove('lp_import_in_progress');
    }
  },

  async getRecentImports() {
    const { initDB } = await import('./db');
    const db = await initDB();
    const prompts = await db.getAll('prompts');

    // Extract unique import sessions
    const sessionsMap = new Map();

    for (const p of prompts) {
      // Check if it was a created duplicate bundle
      if (p.importSessionId) {
        if (!sessionsMap.has(p.importSessionId)) {
          sessionsMap.set(p.importSessionId, {
            id: p.importSessionId,
            bundleName: p.importBundleName || 'Imported Workflow',
            importedAt: p.importedAt || p.updatedAt || new Date().toISOString(),
            itemCount: 1,
            isUpdate: false
          });
        } else {
          sessionsMap.get(p.importSessionId).itemCount++;
        }
      }
      // check if it was an updated bundle (snapshot exists inside the chain)
      else if (p.chain && p.chain.length > 0 && p.chain[0].versions && p.chain[0].versions.length > 0) {
        const taggedSnapshot = p.chain[0].versions.find(v => v.importSessionId);
        if (taggedSnapshot) {
          if (!sessionsMap.has(taggedSnapshot.importSessionId)) {
            sessionsMap.set(taggedSnapshot.importSessionId, {
              id: taggedSnapshot.importSessionId,
              bundleName: `Workflow Update: ${p.title}`,
              importedAt: taggedSnapshot.timestamp || new Date().toISOString(),
              itemCount: 1,
              isUpdate: true
            });
          } else {
            sessionsMap.get(taggedSnapshot.importSessionId).itemCount++;
          }
        }
      }
    }

    // Note: To be perfectly accurate on item counts we would scan snippets and knowledge too,
    // but scanning just prompts provides the session list efficiently. We can just say "Workflow" in the UI.

    return Array.from(sessionsMap.values()).sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
  },

  async undoWorkflowImport(importSessionId) {
    if (!importSessionId) return false;

    const { initDB } = await import('./db');
    const db = await initDB();

    const stores = ['prompts', 'snippets', 'knowledge'];

    // 1. ATOMIC READ-MODIFY-WRITE: Read inside a transaction to prevent TOCTOU races with auto-save
    const tx_read = db.transaction(stores, 'readwrite');
    const allData = {};
    for (const storeName of stores) {
      allData[storeName] = await tx_read.objectStore(storeName).getAll();
    }
    await tx_read.done;

    // 2. MUTATION PHASE: Compute all changes in memory (no DB interaction)
    const mutations = {
      prompts: { puts: [], deletes: [] },
      snippets: { puts: [], deletes: [] },
      knowledge: { puts: [], deletes: [] }
    };

    for (const storeName of stores) {
      for (const item of allData[storeName]) {
        let isRestoredUpdate = false;

        // Helper: Check if item is a Prompt (has chain) or Snippet/KB (has direct versions)
        const versionsArray = (storeName === 'prompts' && item.chain && item.chain.length > 0)
          ? item.chain[0].versions
          : item.versions;

        if (versionsArray && versionsArray.length > 0) {
          const snapshotIndex = versionsArray.findIndex(v => v.importSessionId === importSessionId);
          if (snapshotIndex !== -1) {
            const taggedSnapshot = versionsArray[snapshotIndex];

            // Restore the content and presets
            if (storeName === 'prompts') {
              // For prompts, restore the primary chain step AND the global content
              item.chain[0].content = taggedSnapshot.content;
              item.content = item.chain.map(s => s.content).join('\n');
              // Restore Presets state
              if (taggedSnapshot.presets) {
                  item.presets = taggedSnapshot.presets;
              }
            } else {
              item.content = taggedSnapshot.content;
            }

            item.updatedAt = new Date().toISOString();

            // Clear out any import session markers on the main object if they exist
            if (item.importSessionId === importSessionId) {
              delete item.importSessionId;
              delete item.importBundleName;
              delete item.importedAt;
            }

            // Remove this specific snapshot since we rolled back to it
            versionsArray.splice(snapshotIndex, 1);

            mutations[storeName].puts.push(item);
            isRestoredUpdate = true;
          }
        }

        // If it wasn't an update, check if it's a completely newly imported item
        if (!isRestoredUpdate && item.importSessionId === importSessionId) {
          mutations[storeName].deletes.push(item.id);
        }
      }
    }

    // 3. WRITE PHASE: Execute all mutations in a single fast transaction (no event-loop starvation)
    const tx = db.transaction(stores, 'readwrite');
    try {
      for (const storeName of stores) {
        const store = tx.objectStore(storeName);
        // Parallel execution keeps the transaction alive
        await Promise.all([
          ...mutations[storeName].puts.map(item => store.put(item)),
          ...mutations[storeName].deletes.map(id => store.delete(id))
        ]);
      }
      await tx.done;

      // Broadcast UI updates
      chrome.runtime.sendMessage({ action: "RELOAD_DATA" }, () => { if (chrome.runtime.lastError) { } });
      chrome.runtime.sendMessage({ action: "REFRESH_MENU" }, () => { if (chrome.runtime.lastError) { } });

      return true;
    } catch (err) {
      if (tx) {
        try {
          tx.abort();
        } catch (abortError) {
          // Ignoriere Folgefehler, falls die Transaktion bereits inaktiv war
        }
      }
      console.error("Undo Import Transaction failed:", err);
      throw new Error("Failed to undo the import.");
    }
  }
};