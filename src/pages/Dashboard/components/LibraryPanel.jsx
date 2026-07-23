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
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { Plus, X, Search, Calendar, Clock, Star, ArrowUpDown, Check, SortAsc, Globe } from 'lucide-react';
import usePromptStore from '../../../stores/promptStore';
import Rating from '../../../components/Rating';
// Präziser Pfad zum globalen Komponenten-Ordner
import PromptList from '../../../components/PromptList';
import SearchInput from '../../../components/SearchInput';
import ActiveFilterBar from '../../../components/ActiveFilterBar';

/**
 * Manages the prompt list, search, and filter indicators.
 * Supports smooth showing and hiding via Framer Motion.
 */
export default function LibraryPanel({
  isCollapsed,
  onToggleCollapse,
  prompts,
  activePromptId,
  onSelect,
  onDeletePrompt,
  onDuplicatePrompt,
  onBulkDelete,
  searchQuery,
  onSearchChange,
  onCreate,
  selectedTags,
  onClearTags,
  onRemoveTag, // <-- NEU: Sicherer Callback zum Löschen einzelner Tags
  tags,
  onCreateCollection,
  backlinks = {},
  onOpenKnowledgeTile,
  onOpenPromptNote
}) {
  const { sortMode, setSortMode, activeCollectionId, setActiveCollection, collections } = usePromptStore();
  const activeCollection = collections.find(c => c.id === activeCollectionId);
  const [showSort, setShowSort] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [createMenuPos, setCreateMenuPos] = useState({ top: 0, right: 0 });
  const sortBtnRef = useRef(null);
  const createBtnRef = useRef(null);

  useEffect(() => {
    if (!showCreateMenu) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowCreateMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateMenu]);

  const handleOpenSort = () => {
    if (!showSort && sortBtnRef.current) {
      const rect = sortBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowSort(prev => !prev);
  };

  const handleOpenCreateMenu = () => {
    if (!showCreateMenu && createBtnRef.current) {
      const rect = createBtnRef.current.getBoundingClientRect();
      setCreateMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowCreateMenu(prev => !prev);
  };

  const sortOptions = [
    { id: 'updated', label: 'Updated', icon: Clock },
    { id: 'title', label: 'A-Z Title', icon: SortAsc },
    { id: 'created', label: 'Created', icon: Calendar },
    { id: 'accessed', label: 'Accessed', icon: ArrowUpDown },
    { id: 'rating', label: 'Rating', icon: Star },
  ];
  // The panel is controlled by the orchestrator via AnimatePresence.
  // We define the width animation for "Focus Mode" here.
  return (
    <motion.div
      id="dash-library"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: isCollapsed ? 0 : 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="border-r border-border dark:!border-white/[0.05] flex flex-col flex-shrink-0 bg-bg dark:!bg-[#0d0c14] z-20 shadow-lg overflow-hidden"
    >
      {/* 1. HEADER: Title, Filter-Status & Create-Button */}
      <div className="h-14 px-4 border-b border-border flex justify-between items-center bg-bg-surface dark:!bg-transparent backdrop-blur-md shrink-0 relative z-30">
        <div className="flex items-center gap-2 overflow-hidden">
          <h2 className="font-semibold text-xs text-text-muted uppercase tracking-wider truncate">
            {(selectedTags || []).length > 0 ? `Filtered (${selectedTags.length})` : "Library"}
          </h2>
          {(selectedTags || []).length > 0 && (
            <button
              onClick={onClearTags}
              className="text-text-muted hover:text-text-main p-1 transition-colors"
              title="Clear active filters"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            ref={sortBtnRef}
            onClick={handleOpenSort}
            className={`p-1.5 rounded-md transition-colors border ${showSort ? 'bg-primary/10 border-primary/20 text-primary' : 'hover:bg-bg-hover text-text-muted border-transparent'}`}
            title="Sort Library"
          >
            <ArrowUpDown size={16} />
          </button>

          <button
            ref={createBtnRef}
            onClick={handleOpenCreateMenu}
            className={`p-1.5 rounded-md transition-colors border ${
              showCreateMenu 
                ? 'bg-primary/10 border-primary/20 text-primary' 
                : 'hover:bg-bg-hover text-primary border-transparent hover:border-border'
            }`}
            title="Create or import prompt"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Sort Menu - Portal into document.body to escape overflow-hidden + stacking contexts */}
      {showSort && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowSort(false)} />
          <div
            className="fixed w-44 bg-bg-surface border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[9999] p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/20 dm-dropdown"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <div className="px-2 py-1.5 mb-1 border-b border-border/50">
              <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Sort by</span>
            </div>
            {sortOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => { setSortMode(opt.id); setShowSort(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${sortMode === opt.id ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
              >
                <div className="flex items-center gap-2.5">
                  <opt.icon size={14} className={sortMode === opt.id ? 'text-primary' : 'text-text-faint'} />
                  {opt.label}
                </div>
                {sortMode === opt.id && <Check size={12} className="text-primary" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* Creation Menu - Portal into document.body to escape overflow-hidden + stacking contexts */}
      {showCreateMenu && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowCreateMenu(false)} />
          <div 
            className="fixed w-52 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
            style={{ top: createMenuPos.top, right: createMenuPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1.5 mb-1 border-b border-border/50 flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Add Content</span>
              <button 
                onClick={() => setShowCreateMenu(false)} 
                className="text-text-muted hover:text-text-main p-0.5 rounded hover:bg-bg-hover"
              >
                <X size={12} />
              </button>
            </div>

            <button
              onClick={() => {
                setShowCreateMenu(false);
                onCreate();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-text-main hover:bg-bg-hover transition-colors text-left"
            >
              <Plus size={14} className="text-primary shrink-0" />
              <span>New Blank Prompt</span>
            </button>

            <button
              onClick={() => {
                setShowCreateMenu(false);
                window.open("https://leanprompts.app/explore/", "_blank");
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <Globe size={14} className="text-indigo-400 shrink-0" />
                <span>Browse Workflow Hub</span>
              </div>
              <span className="text-[10px] text-text-faint font-mono">↗</span>
            </button>
          </div>
        </>,
        document.body
      )}

      {/* 2. SEARCH AREA: Interactive Search Bar */}
      <div className="p-2 border-b border-border bg-bg/50 dark:!bg-transparent">
        <SearchInput
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onClear={() => onSearchChange("")}
          onFocus={(e) => e.target.select()}
          placeholder="Search library..."
        />
      </div>

      {/* Active Filter Bar */}
      <ActiveFilterBar
        activeCollection={activeCollection}
        selectedTags={selectedTags}
        searchQuery={searchQuery}
        onClearCollection={() => setActiveCollection(null)}
        onRemoveTag={onRemoveTag}
        onClearSearch={() => onSearchChange("")}
        onClearAll={() => {
          setActiveCollection(null);
          onClearTags();
          onSearchChange("");
        }}
      />

      {/* 3. PROMPT LIST: Rendering the actual items */}
      <PromptList
        prompts={prompts}
        activePromptId={activePromptId}
        onSelect={onSelect}
        onDeleteRequest={onDeletePrompt}
        onDuplicateRequest={onDuplicatePrompt}
        onBulkDeleteRequest={onBulkDelete}
        tags={tags}
        onCreateCollection={onCreateCollection}
        backlinks={backlinks}
        onOpenKnowledgeTile={onOpenKnowledgeTile}
        onOpenPromptNote={onOpenPromptNote}
      />
    </motion.div>
  );
}