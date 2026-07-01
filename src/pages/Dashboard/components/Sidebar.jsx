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
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Command, LayoutGrid, Settings, Hash, ChevronLeft, Search,
  ChevronRight, BookOpen, Sun, Moon, Github, Coffee, MessageSquare, Plus, X,
  Pencil, ArrowDownAZ, Clock, GripVertical, Check, Calendar, ChevronDown, CheckSquare, Trash2
} from 'lucide-react';
import usePromptStore from '../../../stores/promptStore';
import CollectionColorPicker from '../../../components/CollectionColorPicker';

/**
 * SIDEBAR MODULE
 * Orchestrates navigation, tags, and global app actions.
 */
export default function Sidebar({
  isCollapsed,
  onCollapse,
  currentView,
  onViewChange,
  isDarkMode,
  onToggleTheme,
  onFeedbackOpen,
  tags,
  selectedTags,
  onTagToggle,
  collections = [],
  activeCollectionId,
  onCreateCollection,
  onCollectionSelect,
  onCollectionDelete,
  onRenameCollection,
  onRenameTag,
  onDeleteTag,
  onBulkDeleteCollections,
  onBulkDeleteTags
}) {
  const [localSearch, setLocalSearch] = React.useState("");
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState(null);
  const [tagSort, setTagSort] = React.useState('alpha'); // 'alpha' | 'count' | 'date'
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const [tagSortCoords, setTagSortCoords] = React.useState({ top: 0, left: 0 });
  const [colSort, setColSort] = React.useState('alpha'); // 'alpha' | 'count' | 'date'
  const [isColSortOpen, setIsColSortOpen] = React.useState(false);
  const [colSortCoords, setColSortCoords] = React.useState({ top: 0, left: 0 });
  // BULK MANAGE STATE
  const [isColManageMode, setIsColManageMode] = React.useState(false);
  const [selectedColIds, setSelectedColIds] = React.useState([]);
  const [isTagManageMode, setIsTagManageMode] = React.useState(false);
  const [selectedTagNames, setSelectedTagNames] = React.useState([]);
  // COLOR PICKER STATE
  const [colorPickerConfig, setColorPickerConfig] = React.useState({ isOpen: false, colId: null, anchorRect: null });

  const { prompts, snippets, settings, saveCollection } = usePromptStore();

  const backupStatus = React.useMemo(() => {
    // Filtere Demo-/Seed-Daten heraus: nur ECHTE User-Inhalte zählen
    const userPrompts = (prompts || []).filter(p => !p.id?.startsWith('demo-'));
    const userSnippets = (snippets || []).filter(s => !s.id?.startsWith('demo-'));
    const hasUserData = userPrompts.length > 0 || userSnippets.length > 0;

    // Keine eigenen Inhalte -> nichts zu sichern -> kein Dot
    if (!hasUserData) return { show: false, message: "" };

    const now = Date.now();

    // FALL 1: Backup (oder Import) existiert bereits -> prüfe Alter
    if (settings?.lastBackupTime) {
      const daysSince = Math.floor((now - new Date(settings.lastBackupTime).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 14) {
        return { show: true, message: `Last backup was ${daysSince} days ago. Consider exporting a new one in Settings → Backup.` };
      }
      return { show: false, message: "" };
    }

    // FALL 2: Noch nie ein Backup -> Schonfrist anhand des ältesten EIGENEN Elements
    let oldestTime = now;
    const allUserItems = [...userPrompts, ...userSnippets];
    for (const item of allUserItems) {
      const t = new Date(item.createdAt || item.updatedAt || now).getTime();
      if (t < oldestTime) oldestTime = t;
    }
    const daysSinceStart = Math.floor((now - oldestTime) / (1000 * 60 * 60 * 24));

    // Schonfrist: <= 3 Tage -> noch kein Reminder
    if (daysSinceStart <= 3) return { show: false, message: "" };

    return { show: true, message: "You've been building your library for a few days — protect your work with a backup in Settings → Backup." };
  }, [prompts, snippets, settings?.lastBackupTime]);

  const tagDates = React.useMemo(() => {
    const dates = {};
    const process = (items) => {
      items.forEach(item => {
        const itemDate = new Date(item.createdAt || item.updatedAt || 0).getTime();
        (item.tags || []).forEach(tag => {
          if (!dates[tag] || itemDate < dates[tag]) { // Find EARLIEST use (Creation)
            dates[tag] = itemDate;
          }
        });
      });
    };
    process(prompts || []);
    process(snippets || []);
    return dates;
  }, [prompts, snippets]);

  const collectionCounts = React.useMemo(() => {
    const counts = {};
    [...(prompts || []), ...(snippets || [])].forEach(item => {
      if (item.collectionId) {
        counts[item.collectionId] = (counts[item.collectionId] || 0) + 1;
      }
    });
    return counts;
  }, [prompts, snippets]);

  const sortedCollections = React.useMemo(() => {
    let c = [...(collections || [])];
    if (colSort === 'count') {
      c.sort((a, b) => (collectionCounts[b.id] || 0) - (collectionCounts[a.id] || 0));
    } else if (colSort === 'date') {
      c.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else {
      c.sort((a, b) => a.name.localeCompare(b.name));
    }
    return c;
  }, [collections, colSort, collectionCounts]);

  const sortedTags = React.useMemo(() => {
    let t = [...(tags || [])];
    if (tagSort === 'count') {
      t.sort((a, b) => b.count - a.count);
    } else if (tagSort === 'date') {
      t.sort((a, b) => (tagDates[b.name] || 0) - (tagDates[a.name] || 0));
    } else {
      t.sort((a, b) => a.name.localeCompare(b.name));
    }
    return t;
  }, [tags, tagSort, tagDates]);

  return (
    <motion.aside
      id="dash-sidebar"
      initial={false}
      animate={{ width: isCollapsed ? 64 : 256 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="border-r border-border dark:!border-white/[0.05] bg-bg-surface dark:!bg-[#11111a] flex flex-col flex-shrink-0 z-20 relative shadow-xl overflow-hidden"
    >
      {/* 1. HEADER: Branding & Collapse Toggle */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border/50 dark:border-white/10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden">
            <img src="/icon48.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          {!isCollapsed && (
            <span className="font-bold tracking-tight text-lg whitespace-nowrap text-text-main animate-fade-in">
              LeanPrompts
            </span>
          )}
        </div>

        <button
          onClick={onCollapse}
          className="p-1.5 hover:bg-bg-hover rounded-md text-text-muted transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* 2. NAVIGATION: Main Views */}
      <nav className="p-2 space-y-1 flex-1 flex flex-col min-h-0">
        <NavItem
          icon={<LayoutGrid size={18} />}
          label="My Prompts"
          active={currentView === 'library'}
          collapsed={isCollapsed}
          onClick={() => { onViewChange('library'); }}
        />
        <NavItem
          icon={<Command size={18} />}
          label="Snippets"
          active={currentView === 'snippets'}
          collapsed={isCollapsed}
          onClick={() => onViewChange('snippets')}
        />

        <NavItem
          icon={<BookOpen size={18} />}
          label="Knowledge Base"
          active={currentView === 'guide'}
          collapsed={isCollapsed}
          onClick={() => onViewChange('guide')}
        />

        {/* ECHTE OPTISCHE TRENNUNG: Atempause (mt-4) und sichtbarer Strich */}
        <div className="mt-4 mb-2">
            <div className="h-px bg-border dark:bg-white/10 mx-2"></div>
        </div>

        {/* COLLECTIONS SECTION */}
        {!isCollapsed && (
          <div className="animate-fade-in flex flex-col min-h-0 shrink-0" style={{ maxHeight: '35%' }}>
            <div className="px-4 pb-2 pt-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  Collections
                  <button
                    onClick={() => {
                      setIsColManageMode(!isColManageMode);
                      setSelectedColIds([]);
                    }}
                    className={`p-1 rounded transition-colors ${isColManageMode ? 'bg-primary/10 text-primary' : 'hover:bg-bg-hover text-text-muted hover:text-text-main'}`}
                    title={isColManageMode ? "Exit Manage Mode" : "Manage Collections"}
                  >
                    <CheckSquare size={12} />
                  </button>
                  {isColManageMode && <span className="text-primary normal-case bg-primary/10 px-1.5 rounded">{selectedColIds.length}</span>}
                </span>

                <div className="flex items-center gap-1">
                  {isColManageMode && selectedColIds.length > 0 && (
                    <button
                      onClick={() => {
                        if (onBulkDeleteCollections) onBulkDeleteCollections(selectedColIds);
                        setIsColManageMode(false);
                        setSelectedColIds([]);
                      }}
                      className="p-1 hover:bg-red-500/10 text-red-400 hover:text-red-500 rounded transition-colors"
                      title="Delete Selected"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setColSortCoords({ top: rect.bottom, left: rect.left });
                        setIsColSortOpen(!isColSortOpen);
                      }}
                      className={`p-1 rounded hover:bg-bg-hover transition-colors ${isColSortOpen ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-main'}`}
                      title="Sort Collections"
                    >
                      {colSort === 'alpha' ? <ArrowDownAZ size={12} /> : colSort === 'count' ? <Clock size={12} /> : <Calendar size={12} />}
                    </button>
                    {isColSortOpen && createPortal(
                      <div className="fixed inset-0 z-50 flex items-start justify-start isolate" style={{ pointerEvents: 'none' }}>
                        <div className="fixed inset-0 z-40" onClick={() => setIsColSortOpen(false)} style={{ pointerEvents: 'auto' }} />
                        <div
                          className="fixed mt-1 w-32 bg-bg-surface border border-border rounded-lg shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 origin-top-left dm-dropdown"
                          style={{ top: colSortCoords.top, left: colSortCoords.left, pointerEvents: 'auto' }}
                        >
                          {[
                            { id: 'alpha', label: 'Name', icon: ArrowDownAZ },
                            { id: 'count', label: 'Count', icon: Clock },
                            { id: 'date', label: 'Created', icon: Calendar }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => { setColSort(opt.id); setIsColSortOpen(false); }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${colSort === opt.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-bg-hover hover:text-text-main'}`}
                            >
                              <opt.icon size={12} />
                              <span>{opt.label}</span>
                              {colSort === opt.id && <Check size={10} className="ml-auto" />}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!isColManageMode && (
                  <button
                    onClick={onCreateCollection}
                    className="p-1 hover:bg-bg-hover rounded text-text-muted hover:text-primary transition-colors"
                    title="Create Collection"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
              {sortedCollections.map((col) => (
                <div
                  key={col.id}
                  onClick={() => {
                    if (isColManageMode) {
                      setSelectedColIds(prev => prev.includes(col.id) ? prev.filter(i => i !== col.id) : [...prev, col.id]);
                    } else {
                      !editingItem && onCollectionSelect(col.id);
                    }
                  }}

                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${activeCollectionId === col.id
                    ? 'bg-primary-subtle text-primary font-medium'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-main'
                    }`}
                >
                  {editingItem?.type === 'col' && editingItem.id === col.id ? (
                    <input
                      autoFocus
                      value={editingItem.value}
                      onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                      onBlur={() => {
                        if (editingItem.value !== col.name) onRenameCollection(col.id, editingItem.value);
                        setEditingItem(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (editingItem.value !== col.name) onRenameCollection(col.id, editingItem.value);
                          setEditingItem(null);
                        }
                        if (e.key === 'Escape') setEditingItem(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="bg-transparent border-b border-primary outline-none w-full text-text-main"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2 truncate flex-1">
                        {isColManageMode ? (
                          <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${selectedColIds.includes(col.id) ? 'bg-primary border-primary shadow-sm' : 'border-zinc-300 dark:border-text-muted/40 bg-white dark:bg-transparent'}`}>
                            {selectedColIds.includes(col.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                          </div>
                        ) : (
                          <button
                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-transparent hover:ring-white/20 transition-all cursor-pointer"
                            style={{ backgroundColor: col.color === 'none' ? '#71717a' : (col.color || '#6366f1') }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (colorPickerConfig.isOpen && colorPickerConfig.colId === col.id) {
                                setColorPickerConfig({ isOpen: false, colId: null, anchorRect: null });
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setColorPickerConfig({ isOpen: true, colId: col.id, anchorRect: rect });
                              }
                            }}
                            title="Change collection color"
                          />
                        )}
                        <span className="truncate" title={col.name}>
                          {col.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem({ type: 'col', id: col.id, value: col.name });
                          }}
                          className="p-1 hover:bg-bg-hover rounded text-text-muted hover:text-primary transition-all"
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCollectionDelete(col.id);
                          }}
                          className="p-1 hover:bg-red-500/10 rounded text-text-muted hover:text-red-400 transition-all"
                          title="Delete Collection"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* COLOR PICKER POPUP (Portal-based, independent of sidebar overflow) */}
            {colorPickerConfig.isOpen && (() => {
              const targetCol = collections.find(c => c.id === colorPickerConfig.colId);
              if (!targetCol) return null;
              return (
                <CollectionColorPicker
                  anchorRect={colorPickerConfig.anchorRect}
                  currentColor={targetCol.color || '#6366f1'}
                  currentOpacity={targetCol.colorOpacity != null ? targetCol.colorOpacity : 0.08}
                  onColorChange={(newColor) => {
                    saveCollection({ ...targetCol, color: newColor });
                  }}
                  onOpacityChange={(newOpacity) => {
                    saveCollection({ ...targetCol, colorOpacity: newOpacity });
                  }}
                  onClose={() => setColorPickerConfig({ isOpen: false, colId: null, anchorRect: null })}
                />
              );
            })()}
          </div>
        )}

        <div className="h-px bg-border dark:bg-white/10 my-2 mx-2"></div>

        {/* 3. TAGS SECTION */}
        {!isCollapsed && tags && tags.length > 0 && (
          <div className="mt-2 flex-1 flex flex-col min-h-0 animate-fade-in">
            <div className="px-4 pb-2 pt-2 flex items-center justify-between shrink-0 group/search">
              {/* Using a cleaner header style without uppercase for a more modern look if desired, or keeping it consistent but spaced */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  Tags
                  <button
                    onClick={() => {
                      setIsTagManageMode(!isTagManageMode);
                      setSelectedTagNames([]);
                    }}
                    className={`p-1 rounded transition-colors ${isTagManageMode ? 'bg-primary/10 text-primary' : 'hover:bg-bg-hover text-text-muted hover:text-text-main'}`}
                    title={isTagManageMode ? "Exit Manage Mode" : "Manage Tags"}
                  >
                    <CheckSquare size={12} />
                  </button>
                  {isTagManageMode && <span className="text-primary normal-case bg-primary/10 px-1.5 rounded">{selectedTagNames.length}</span>}
                </span>
                <div className="flex items-center gap-1">
                  {isTagManageMode && selectedTagNames.length > 0 && (
                    <button
                      onClick={() => {
                        if (onBulkDeleteTags) onBulkDeleteTags(selectedTagNames);
                        setIsTagManageMode(false);
                        setSelectedTagNames([]);
                      }}
                      className="p-1 hover:bg-red-500/10 text-red-400 hover:text-red-500 rounded transition-colors"
                      title="Delete Selected"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTagSortCoords({ top: rect.bottom, left: rect.left });
                        setIsSortOpen(!isSortOpen);
                      }}
                      className={`p-1 rounded hover:bg-bg-hover transition-colors ${isSortOpen ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-main'}`}
                      title="Sort Tags"
                    >
                      {tagSort === 'alpha' ? <ArrowDownAZ size={12} /> : tagSort === 'count' ? <Clock size={12} /> : <Calendar size={12} />}
                    </button>
                    {isSortOpen && createPortal(
                      <div className="fixed inset-0 z-50 flex items-start justify-start isolate" style={{ pointerEvents: 'none' }}>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} style={{ pointerEvents: 'auto' }} />
                        <div
                          className="fixed mt-1 w-32 bg-bg-surface border border-border rounded-lg shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 origin-top-left dm-dropdown"
                          style={{ top: tagSortCoords.top, left: tagSortCoords.left, pointerEvents: 'auto' }}
                        >
                          {[
                            { id: 'alpha', label: 'Name', icon: ArrowDownAZ },
                            { id: 'count', label: 'Count', icon: Clock },
                            { id: 'date', label: 'Created', icon: Calendar }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => { setTagSort(opt.id); setIsSortOpen(false); }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${tagSort === opt.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-bg-hover hover:text-text-main'}`}
                            >
                              <opt.icon size={12} />
                              <span>{opt.label}</span>
                              {tagSort === opt.id && <Check size={10} className="ml-auto" />}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              </div>

              {(localSearch || isSearchFocused) && (
                <div className="w-px h-3 bg-border mx-2 animate-fade-in" />
              )}

              <div className="flex items-center gap-2 flex-1 justify-end">
                <div className={`relative flex items-center ${localSearch || isSearchFocused ? 'flex-1 max-w-[120px]' : ''}`}>
                  <div
                    className={`
                      flex items-center gap-2 transition-all duration-200 
                      ${localSearch || isSearchFocused
                        ? 'w-full bg-bg-elevated px-2 py-1 rounded-md border border-primary/20 shadow-sm'
                        : 'hover:bg-bg-hover p-1 rounded-md cursor-pointer'
                      }
                    `}
                    onClick={() => document.getElementById('tag-search-input')?.focus()}
                  >
                    <Search size={12} className={localSearch || isSearchFocused ? "text-primary" : "text-text-muted"} />
                    <input
                      id="tag-search-input"
                      value={localSearch}
                      onChange={(e) => setLocalSearch(e.target.value)}
                      placeholder="Search tags..."
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                      className={`
                        bg-transparent border-none focus:outline-none text-xs text-text-main placeholder:text-text-muted/50 
                        transition-all duration-200
                        ${localSearch || isSearchFocused ? 'w-full opacity-100' : 'w-0 opacity-0 p-0'}
                      `}
                    />
                    {localSearch && (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); setLocalSearch(""); }}
                        className="text-text-muted hover:text-text-main shrink-0 p-0.5 rounded-full hover:bg-bg-hover transition-all"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar">
              {(tags.filter(t => t.name.toLowerCase().includes(localSearch.toLowerCase()))).length === 0 && localSearch ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[10px] text-text-muted italic">No tags found.</p>
                </div>
              ) : (
                sortedTags.filter(t => t.name.toLowerCase().includes(localSearch.toLowerCase())).map(({ name, count }) => (
                  <div
                    key={name}
                    onClick={() => {
                      if (isTagManageMode) {
                        setSelectedTagNames(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
                      } else {
                        !editingItem && onTagToggle(name);
                      }
                    }}

                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${selectedTags.includes(name)
                      ? 'bg-primary-subtle text-primary font-medium'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-main'
                      }`}
                  >
                    {editingItem?.type === 'tag' && editingItem.id === name ? (
                      <input
                        autoFocus
                        value={editingItem.value}
                        onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                        onBlur={() => {
                          if (editingItem.value !== name) onRenameTag(name, editingItem.value);
                          setEditingItem(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (editingItem.value !== name) onRenameTag(name, editingItem.value);
                            setEditingItem(null);
                          }
                          if (e.key === 'Escape') setEditingItem(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="bg-transparent border-b border-primary outline-none w-full text-text-main"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate flex-1">
                          {isTagManageMode ? (
                            <div className={`min-w-[14px] h-3.5 border rounded flex items-center justify-center transition-colors ${selectedTagNames.includes(name) ? 'bg-primary border-primary shadow-sm' : 'border-zinc-300 dark:border-text-muted/40 bg-white dark:bg-transparent'}`}>
                              {selectedTagNames.includes(name) && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>
                          ) : (
                            <Hash size={14} className={selectedTags.includes(name) ? 'text-primary' : 'text-text-muted/50'} />
                          )}
                          <span className="truncate" title={name}>
                            {name}
                            {localSearch && (
                              <span className="ml-1 text-[9px] text-text-muted opacity-50 font-mono"></span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-[9px] font-bold py-0.5 px-1.5 rounded-md ${selectedTags.includes(name)
                            ? 'bg-primary text-white'
                            : 'bg-bg-elevated text-text-muted border border-border'
                            }`}>
                            {count}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem({ type: 'tag', id: name, value: name });
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-bg-hover rounded text-text-muted hover:text-primary transition-all"
                            title="Rename Tag"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteTag) onDeleteTag(name, count);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all"
                            title="Delete Tag"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </nav>

      {/* 4. FOOTER: Theme, Settings & External Links */}
      <div className="shrink-0 p-2 mt-auto border-t border-border dark:border-white/10 pt-3 flex flex-col gap-3">

        {/* Gruppe 1: App-Steuerung */}
        <div className="flex flex-col gap-1">
          <NavItem
            icon={isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            label={isDarkMode ? "Light Mode" : "Dark Mode"}
            collapsed={isCollapsed}
            onClick={onToggleTheme}
          />

          <NavItem
            icon={
              <div className="relative">
                <Settings size={18} />
                {backupStatus.show && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-bg-surface shadow-sm"
                    title={backupStatus.message}
                  />
                )}
              </div>
            }
            label="Settings"
            active={currentView === 'settings'}
            collapsed={isCollapsed}
            onClick={() => onViewChange('settings')}
          />
        </div>

        {/* Gruppe 2: Externe Links */}
        <div className="pt-3 border-t border-border dark:border-white/10 flex flex-col gap-1">
          <NavItem
            icon={<MessageSquare size={18} />}
            label="Support & Feedback"
            collapsed={isCollapsed}
            onClick={onFeedbackOpen}
          />
          <NavItem
            icon={<Github size={18} />}
            label="About"
            collapsed={isCollapsed}
            onClick={() => window.open("https://github.com/IvicaV/LeanPrompts", "_blank")}
          />
          <NavItem
            icon={<Coffee size={18} />}
            label="Buy me a coffee"
            collapsed={isCollapsed}
            onClick={() => window.open("https://ko-fi.com/ivicav", "_blank")}
          />
        </div>
      </div>
    </motion.aside >
  );
}

function NavItem({ icon, label, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${active ? 'bg-primary-subtle text-primary font-medium' : 'hover:bg-bg-hover text-text-muted hover:text-text-main'
        }`}
    >
      {active && (
        <div
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full"
          style={{ opacity: 'var(--nav-indicator-opacity, 0)' }}
        />
      )}
      <span className={`transition-colors ${active ? 'text-primary' : 'text-text-muted group-hover:text-text-main'}`}>
        {icon}
      </span>
      {!collapsed && (
        <span className={`text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-primary' : 'text-text-muted group-hover:text-text-main'
          }`}>
          {label}
        </span>
      )}
    </button>
  );
}
