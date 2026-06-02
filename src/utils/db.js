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
import { openDB } from 'idb';

const DB_NAME = 'LeanPromptsDB';
// UPGRADE: Version 7: Add Knowledge Base Store
const DB_VERSION = 9;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {

      // Store 1: Prompts
      if (!db.objectStoreNames.contains('prompts')) {
        const store = db.createObjectStore('prompts', { keyPath: 'id' });
        // Bestehende Indizes
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('tags', 'tags', { multiEntry: true });
        store.createIndex('collectionId', 'collectionId'); // Added for collections
      }

      // Upgrade zu V3: Neue Indizes hinzufügen, falls sie fehlen
      const promptStore = transaction.objectStore('prompts');
      if (!promptStore.indexNames.contains('isPinned')) {
        promptStore.createIndex('isPinned', 'isPinned');
      }
      if (!promptStore.indexNames.contains('usageCount')) {
        promptStore.createIndex('usageCount', 'usageCount');
      }
      if (!promptStore.indexNames.contains('collectionId')) {
        promptStore.createIndex('collectionId', 'collectionId');
      }

      // Store 2: Snippets
      if (!db.objectStoreNames.contains('snippets')) {
        const snippetStore = db.createObjectStore('snippets', { keyPath: 'id' });
        snippetStore.createIndex('name', 'name', { unique: true });
        snippetStore.createIndex('updatedAt', 'updatedAt');
      }

      // UPGRADE V5: Add indices for Snippets (Unified Taxonomy)
      const snippetStore = transaction.objectStore('snippets');
      if (!snippetStore.indexNames.contains('tags')) {
        snippetStore.createIndex('tags', 'tags', { multiEntry: true });
      }
      if (!snippetStore.indexNames.contains('collectionId')) {
        snippetStore.createIndex('collectionId', 'collectionId');
      }

      // Store 3: Collections (V4)
      if (!db.objectStoreNames.contains('collections')) {
        const colStore = db.createObjectStore('collections', { keyPath: 'id' });
        colStore.createIndex('name', 'name');
        colStore.createIndex('updatedAt', 'updatedAt');
      }

      // Store 4: Knowledge Base (V7)
      if (!db.objectStoreNames.contains('knowledge')) {
        const kbStore = db.createObjectStore('knowledge', { keyPath: 'id' });
        kbStore.createIndex('title', 'title');
        kbStore.createIndex('updatedAt', 'updatedAt');
        kbStore.createIndex('tags', 'tags', { multiEntry: true });
        kbStore.createIndex('collectionId', 'collectionId');
      }

      // Store 5: Session Cache (V8) - For heavy attachments
      if (!db.objectStoreNames.contains('session_cache')) {
        db.createObjectStore('session_cache', { keyPath: 'id' });
      }

      // Store 6: Backups (V9) - Quota protection for imports
      if (!db.objectStoreNames.contains('backups')) {
        db.createObjectStore('backups', { keyPath: 'id' });
      }
    },
  });
};

export const dbAPI = {
  // --- SESSION CACHE (QUOTA PROTECTION) ---
  async saveSessionCache(id, data) {
    const db = await initDB();
    return db.put('session_cache', { id, data, updatedAt: new Date().toISOString() });
  },

  async getSessionCache(id) {
    const db = await initDB();
    const entry = await db.get('session_cache', id);
    return entry?.data || null;
  },

  async clearSessionCache() {
    const db = await initDB();
    return db.clear('session_cache');
  },

  // --- BACKUPS (QUOTA PROTECTION) ---
  async saveShadowBackup(id, data) {
    const db = await initDB();
    return db.put('backups', { id, data, updatedAt: new Date().toISOString() });
  },

  async getShadowBackup(id) {
    const db = await initDB();
    return db.get('backups', id);
  },

  async clearShadowBackup(id) {
    const db = await initDB();
    return db.delete('backups', id);
  },
  // --- PROMPTS CRUD ---

  async getAllPrompts() {
    const db = await initDB();
    return db.getAllFromIndex('prompts', 'updatedAt');
  },

  async savePrompt(prompt) {
    const db = await initDB();
    return db.put('prompts', prompt);
  },

  async deletePrompt(id) {
    const db = await initDB();
    return db.delete('prompts', id);
  },

  async getPrompt(id) {
    const db = await initDB();
    return db.get('prompts', id);
  },

  // --- SNIPPETS CRUD ---

  async getAllSnippets() {
    const db = await initDB();
    return db.getAllFromIndex('snippets', 'updatedAt');
  },

  async saveSnippet(snippet) {
    const db = await initDB();
    return db.put('snippets', snippet);
  },

  async deleteSnippet(id) {
    const db = await initDB();
    return db.delete('snippets', id);
  },

  // --- COLLECTIONS CRUD ---

  async getAllCollections() {
    const db = await initDB();
    return db.getAllFromIndex('collections', 'updatedAt');
  },

  async saveCollection(collection) {
    const db = await initDB();
    return db.put('collections', collection);
  },

  async deleteCollection(id) {
    const db = await initDB();
    return db.delete('collections', id);
  },

  // --- KNOWLEDGE BASE CRUD ---

  async getAllKnowledge() {
    const db = await initDB();
    const all = await db.getAllFromIndex('knowledge', 'updatedAt');
    return all || [];
  },

  async saveKnowledge(tile) {
    const db = await initDB();
    return db.put('knowledge', tile);
  },

  async deleteKnowledge(id) {
    const db = await initDB();
    return db.delete('knowledge', id);
  },

  async bulkDeleteKnowledge(ids) {
    const db = await initDB();
    const tx = db.transaction('knowledge', 'readwrite');
    await Promise.all(ids.map(id => tx.store.delete(id)));
    await tx.done;
  },

  // --- BULK PUT OPERATIONS (QUOTA & I/O OPTIMIZED) ---
  async bulkPutPrompts(promptsArray) {
    if (!promptsArray || promptsArray.length === 0) return;
    const db = await initDB();
    const tx = db.transaction('prompts', 'readwrite');
    await Promise.all(promptsArray.map(p => tx.store.put(p)));
    await tx.done;
  },

  async bulkPutSnippets(snippetsArray) {
    if (!snippetsArray || snippetsArray.length === 0) return;
    const db = await initDB();
    const tx = db.transaction('snippets', 'readwrite');
    await Promise.all(snippetsArray.map(s => tx.store.put(s)));
    await tx.done;
  },

  async bulkPutKnowledge(tilesArray) {
    if (!tilesArray || tilesArray.length === 0) return;
    const db = await initDB();
    const tx = db.transaction('knowledge', 'readwrite');
    await Promise.all(tilesArray.map(t => tx.store.put(t)));
    await tx.done;
  },

  // --- ONBOARDING / SEEDING ---

  async seedIfEmpty(initialPrompts, initialSnippets) {
    const db = await initDB();

    const promptCount = await db.count('prompts');

    if (promptCount === 0) {
      const tx = db.transaction(['prompts', 'snippets'], 'readwrite');

      if (initialPrompts && initialPrompts.length > 0) {
        const pStore = tx.objectStore('prompts');
        for (const p of initialPrompts) {
          await pStore.add(p);
        }
      }

      if (initialSnippets && initialSnippets.length > 0) {
        const sStore = tx.objectStore('snippets');
        if (db.objectStoreNames.contains('snippets')) {
          for (const s of initialSnippets) {
            await tx.objectStore('snippets').put(s);
          }
        }
      }

      await tx.done;
      return true;
    }

    return false;
  },

  // --- FACTORY RESET (DELETE ALL) ---
  async clearAllData() {
    const db = await initDB();
    const storeNames = ['prompts', 'snippets', 'collections', 'knowledge', 'session_cache', 'backups'];
    const tx = db.transaction(storeNames, 'readwrite');
    await Promise.all(storeNames.map(name => tx.objectStore(name).clear()));
    await tx.done;
  }
};