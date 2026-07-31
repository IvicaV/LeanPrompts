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
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Plus, BookOpen, FileText, Trash2, MoveRight,
  Lightbulb, Sparkles, Zap, Search, LayoutGrid, LayoutList, Pin, Clock, Calendar, Check, Tag, X, Folder,
  ArrowUpDown, SortAsc, MoreVertical, GripVertical
} from 'lucide-react';
import KnowledgeTileEditor from './KnowledgeTileEditor';
import BulkActionBar from '../../../components/BulkActionBar';
import TagEditorPopover from '../../../components/TagEditorPopover';
import ConfirmationModal from '../../../components/ConfirmationModal';
import CodeBlock from './CodeBlock';
import DynamicTagList from '../../../components/DynamicTagList';
import SearchInput from '../../../components/SearchInput';
import usePromptStore from '../../../stores/promptStore';
import ActiveFilterBar from '../../../components/ActiveFilterBar';
import { formatLeanText, replaceLeanLinksOutsideCode, safeUrlTransform } from '../../../utils/leanFormat';
import { stripComments, compilePrompt, resolveSnippets } from '../../../utils/variableParser';
import { getCollectionTintStyle, getCollectionListRowStyle } from '../../../utils/collectionColors';

class MarkdownErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Markdown Rendering Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 rounded">Preview Error</div>;
    }
    return this.props.children;
  }
}

/**
 * INTERNAL HELPER: Tile
 */
const Tile = React.memo(function Tile({
  tile, isSelected, collections, toggleSelection, onStartEdit, onSave, onDelete,
  onNavigateToPrompt, onNavigateToSnippet, setTagEditorConfig, tileCollectionDropdown, setTileCollectionDropdown,
  isCreatingCollection, setIsCreatingCollection, newCollectionName, setNewCollectionName, onCreateCollection, onEdit,
  snippets = [],
  backlinks = [], onOpenPromptNote, onOpenKnowledgeTile,
  backlinkDropdownOpen, setBacklinkDropdownOpen, backlinkPopupPos, setBacklinkPopupPos,
  activeMenuId, setActiveMenuId, menuPopupPos, setMenuPopupPos
}) {
  const effectiveCollectionId = tile.collectionId || tile.collectionIds?.[0];

  // COLLECTION COLOR TINTING: O(1) lookup via memoized map
  const tileCollection = effectiveCollectionId ? collections.find(c => c.id === effectiveCollectionId) : null;
  const collectionColor = tileCollection?.color || null;
  const collectionOpacity = tileCollection?.colorOpacity != null ? tileCollection.colorOpacity : undefined;
  const collectionTintStyle = !isSelected ? getCollectionTintStyle(collectionColor, tile.isPinned, collectionOpacity) : {};
  const [localPopupPos, setLocalPopupPos] = useState({ top: 0, left: 0 });

  const isDropdownOpen = activeMenuId === tile.id || tileCollectionDropdown === tile.id || backlinkDropdownOpen === tile.id;

  return (
    <div
      id={"kb-tile-" + tile.id}
      className={`group cursor-pointer relative border rounded-2xl p-5 transition-all duration-300 flex flex-col min-h-[280px] max-h-[280px] overflow-hidden
        ${tile.isPinned ? 'kb-pinned-item' : ''}
        ${isSelected
          ? 'border-primary ring-1 ring-primary/20 bg-primary/5 dark:bg-primary/10 shadow-lg'
          : (isDropdownOpen 
              ? 'shadow-sm bg-bg-hover dark:bg-[#1c1c21] border-border dark:border-zinc-700 ' + 
                (tile.isPinned ? 'dark:bg-gradient-to-br dark:from-amber-500/[0.06] dark:to-[#121215]' : '')
              : 'border-border dark:border-zinc-800/80 dark:border-t-white/[0.05] ' +
              (tile.isPinned
                ? 'bg-white dark:bg-[#121215] dark:bg-gradient-to-br dark:from-amber-500/[0.06] dark:to-[#121215] shadow-md'
                : 'bg-white dark:bg-[#121215] shadow-sm')
            )
        }
        ${isDropdownOpen ? 'shadow-2xl' : 'hover:shadow-2xl dark:shadow-[0_0_20px_rgba(0,0,0,0.5)]'}
        dark:hover:bg-[#1c1c21] dark:hover:border-zinc-700`}
      style={collectionTintStyle}
      onClick={(e) => {
        if (window.getSelection().toString().length === 0) {
          onStartEdit(tile);
        }
      }}
    >
      {/* SELECTION CHECKBOX (Top Left) */}
      <div
        className={`absolute top-4 left-4 z-20 ${(!isSelected && !isDropdownOpen) && 'opacity-0 group-hover:opacity-100'} transition-opacity`}
        onClick={(e) => toggleSelection(e, tile.id)}
      >
        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm ${isSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-primary'}`}>
          {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
        </div>
      </div>

      {/* ACTIONS (Hover) */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
        {backlinks && backlinks.length > 0 && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (backlinkDropdownOpen === tile.id) {
                  setBacklinkDropdownOpen(null);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const isFlipped = (window.innerHeight - rect.bottom) < 250;
                  
                  let leftPos = rect.left;
                  if (leftPos + 176 > window.innerWidth - 20) {
                    leftPos = window.innerWidth - 176 - 20;
                  }
                  
                  setBacklinkPopupPos({
                    left: leftPos,
                    ...(isFlipped 
                      ? { bottom: window.innerHeight - rect.top + 4 } 
                      : { top: rect.bottom + 4 })
                  });
                  setBacklinkDropdownOpen(tile.id);
                }
              }}
              className={`p-1 rounded-md transition-all bg-bg-surface/80 backdrop-blur-sm border border-transparent hover:border-border relative group/backlink ${
                backlinkDropdownOpen === tile.id 
                  ? 'bg-bg-elevated text-primary' 
                  : 'text-text-muted hover:text-primary hover:bg-bg-hover'
              }`}
              title="View Backlinks"
            >
              <BookOpen size={12} />
              <span className="absolute -top-1 -right-1 bg-bg-elevated text-[8px] px-0.5 rounded border border-border">
                {backlinks.length}
              </span>
            </button>
            {backlinkDropdownOpen === tile.id && createPortal(
              <div className="portal-root">
                <div
                  className="fixed inset-0 z-[9998]"
                  onClick={(e) => { e.stopPropagation(); setBacklinkDropdownOpen(null); }}
                ></div>
                <div
                  className="fixed bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 w-44"
                  style={backlinkPopupPos}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                    <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Referenced in</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto custom-scrollbar">
                    {backlinks.map((link, idx) => (
                      <button
                        key={idx}
                        className="w-full text-left px-2 py-1.5 rounded text-xs text-text-main hover:bg-bg-hover hover:text-primary truncate flex items-center gap-2"
                        title={`${link.type === 'prompt' ? 'Prompt Note' : link.type === 'snippet' ? 'Snippet' : 'KB Tile'}: ${link.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (link.type === 'prompt' && onOpenPromptNote) {
                            onOpenPromptNote(link.id, link.stepId);
                          } else if (link.type === 'snippet') {
                            window.dispatchEvent(new CustomEvent('NAVIGATE_TO', { detail: { type: 'snippet', id: link.id, tab: 'notes' } }));
                          } else if (onOpenKnowledgeTile) {
                            onOpenKnowledgeTile(link.id);
                          }
                          setBacklinkDropdownOpen(null);
                        }}
                      >
                        <div className="shrink-0 flex items-center justify-center">
                          {link.type === 'prompt' ? (
                            <FileText size={12} className="text-indigo-500" />
                          ) : link.type === 'snippet' ? (
                            <Sparkles size={12} className="text-pink-500" />
                          ) : (
                            <BookOpen size={12} className="text-orange-500" />
                          )}
                        </div>
                        <span className="truncate">{link.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        )}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (tileCollectionDropdown === tile.id) {
                  setTileCollectionDropdown(null);
                  setIsCreatingCollection(false);
              } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const isFlipped = (window.innerHeight - rect.bottom) < 250;
                  
                  setLocalPopupPos({
                      right: window.innerWidth - rect.right,
                      ...(isFlipped 
                          ? { bottom: window.innerHeight - rect.top + 4 } 
                          : { top: rect.bottom + 4 })
                  });
                  setTileCollectionDropdown(tile.id);
                  setIsCreatingCollection(false);
              }
            }}
            className={`p-1 text-text-muted hover:text-primary hover:bg-bg-hover rounded-md transition-all bg-bg-surface/80 backdrop-blur-sm border border-transparent hover:border-border ${tileCollectionDropdown === tile.id ? 'ring-1 ring-border shadow-sm' : ''}`}
            title={effectiveCollectionId ? `In: ${collections.find(c => c.id === effectiveCollectionId)?.name}` : 'Add to Collection'}
          >
            <div className="flex items-center gap-1">
              <Folder size={13} className={effectiveCollectionId ? 'text-text-main' : ''} />
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-all ${effectiveCollectionId ? 'opacity-100' : 'opacity-0'}`}
                  style={{ backgroundColor: effectiveCollectionId ? (collections.find(c => c.id === effectiveCollectionId)?.color || '#6366f1') : 'transparent' }}
                ></div>
            </div>
          </button>
          {tileCollectionDropdown === tile.id && createPortal(
            <div className="portal-root">
              <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setTileCollectionDropdown(null); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
              <div 
                  className="fixed w-44 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                  style={localPopupPos}
                  onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center bg-bg-surface sticky top-0 z-10">
                  <span className="text-[9px] font-bold text-text-faint uppercase tracking-wider">Collections</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                    className="p-1 hover:bg-bg-hover rounded text-primary"
                    title="New Collection"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {isCreatingCollection && (
                  <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                        placeholder="Name..."
                        value={newCollectionName}
                        onChange={e => setNewCollectionName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newCollectionName.trim()) {
                            e.stopPropagation();
                            if (onCreateCollection) {
                              const newId = crypto.randomUUID();
                              await onCreateCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                              if (onEdit) onEdit({ ...tile, collectionId: newId });
                            }
                            setNewCollectionName("");
                            setIsCreatingCollection(false);
                            setTileCollectionDropdown(null);
                          }
                        }}
                      />
                      <button
                        className="p-1 hover:text-red-400"
                        onClick={() => setIsCreatingCollection(false)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEdit) onEdit({ ...tile, collectionId: null, collectionIds: [] });
                      setTileCollectionDropdown(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${!effectiveCollectionId ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>None (Uncategorized)</span>
                    {!effectiveCollectionId && <Check size={10} className="ml-auto" />}
                  </button>
                  {collections.map(col => {
                    const isAssigned = effectiveCollectionId === col.id;
                    return (
                      <button
                        key={col.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEdit) onEdit({ ...tile, collectionId: col.id });
                          setTileCollectionDropdown(null);
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${isAssigned ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                        <span className="truncate">{col.name}</span>
                        {isAssigned && <Check size={10} className="ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        {/* DAS NEUE 3-PUNKTE MENÜ */}
        <div className="relative">
          <button
            id={`kb-menu-btn-${tile.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (activeMenuId === tile.id) {
                setActiveMenuId(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                const isFlipped = (window.innerHeight - rect.bottom) < 200;
                
                setMenuPopupPos({
                  right: window.innerWidth - rect.right,
                  ...(isFlipped 
                      ? { bottom: window.innerHeight - rect.top + 4 } 
                      : { top: rect.bottom + 4 })
                });
                setActiveMenuId(tile.id);
              }
            }}
            className="p-1.5 text-text-faint hover:text-text-main hover:bg-bg-hover rounded-md transition-all bg-bg-surface/80 backdrop-blur-sm border border-transparent hover:border-border"
          >
            <MoreVertical size={14} />
          </button>

          {activeMenuId === tile.id && createPortal(
            <div className="portal-root">
              <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}></div>
              <div 
                className="fixed w-40 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                style={menuPopupPos}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const elm = document.getElementById(`kb-menu-btn-${tile.id}`);
                    const rect = elm ? elm.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                    setTagEditorConfig({
                      isOpen: true,
                      ids: [tile.id],
                      isBulk: false,
                      initialTags: tile.tags || [],
                      anchorRect: {
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                      }
                    });
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                >
                  <Tag size={12} /> Tags
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSave({ ...tile, isPinned: !tile.isPinned }, false);
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                >
                  <Pin size={12} className={tile.isPinned ? 'text-amber-500' : ''} /> {tile.isPinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(tile.id);
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all flex items-center gap-2"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>

      <div className="mb-3 pl-8 pr-16 text-left">
        <h3 className={`text-base font-bold transition-colors flex items-start gap-2 leading-snug h-12 overflow-hidden ${isDropdownOpen ? 'text-primary' : 'text-text-main group-hover:text-primary'}`}>
          <span className="line-clamp-2" title={tile.title || "Untitled"}>{tile.title || "Untitled"}</span>
        </h3>
      </div>

      <div className="mb-3 px-1 h-6 overflow-hidden">
        <DynamicTagList tags={tile.tags || []} maxTagWidth={80} />
      </div>

      {/* SEPARATOR */}
      <div className="border-b border-border/50 mb-4 mx-1"></div>

      {/* CONTENT PREVIEW */}
      <div className="relative overflow-hidden flex-1 min-h-0 text-left px-1">
        <div className="text-xs text-text-muted/80 line-clamp-3">
          <MarkdownErrorBoundary>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              urlTransform={safeUrlTransform}
              rehypePlugins={[]}
              components={{
                  table: ({node, ...props}) => (
                      <div className="w-full overflow-x-auto custom-scrollbar my-6 rounded-xl border border-border/50 bg-bg-surface/30">
                          <table className="w-full text-left border-collapse text-sm" {...props} />
                      </div>
                  ),
                  thead: ({node, ...props}) => (
                      <thead className="bg-bg-elevated/50 text-text-main border-b border-border/80" {...props} />
                  ),
                  th: ({node, ...props}) => (
                      <th className="p-3 font-bold text-xs uppercase tracking-wider whitespace-nowrap border-r border-border/20 last:border-r-0" {...props} />
                  ),
                  td: ({node, ...props}) => (
                      <td className="p-3 text-text-muted border-b border-border/30 border-r border-border/20 last:border-r-0 min-w-[140px] align-top leading-relaxed" {...props} />
                  ),
                  code: (props) => <CodeBlock {...props} collectionColor={collectionColor} onNavigateToPrompt={onNavigateToPrompt} />,
                h1: ({ node, ...props }) => <p className="font-bold text-text-main mb-1 text-sm mt-0" {...props} />,
                h2: ({ node, ...props }) => <p className="font-bold text-text-main mb-1 text-sm mt-0" {...props} />,
                h3: ({ node, ...props }) => <p className="font-bold text-text-main mb-1 text-xs mt-0" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc ml-3 space-y-0.5 my-1" {...props} />,
                li: ({ node, ...props }) => <li className="my-0" {...props} />,
                p: ({ children }) => (
                  <p className="mb-1 leading-normal text-text-muted/90">
                    {React.Children.map(children, child =>
                      typeof child === 'string' ? formatLeanText(child, onNavigateToPrompt) : child
                    )}
                  </p>
                ),
                a: ({ node, children, href, ...props }) => {
                  // 🛡️ SECURITY GUARD: Smart Blacklist for Phishing/XSS
                  const safeHref = (href || '').trim();
                  const isInternal = safeHref.startsWith('prompt:') || safeHref.startsWith('snippet:');
                  
                  const isDangerous = safeHref.toLowerCase().startsWith('javascript:') || 
                                      safeHref.toLowerCase().startsWith('vbscript:') || 
                                      safeHref.toLowerCase().startsWith('data:text/html');

                  if (isDangerous) {
                      return <span className="text-red-500 line-through cursor-not-allowed" title="Blocked for your safety: This link contains unsafe code">{children}</span>;
                  }

                  if (isInternal) {
                      const isPromptLink = safeHref.startsWith('prompt:');
                      const isSnippetLink = safeHref.startsWith('snippet:');
                      const target = decodeURIComponent(safeHref.split(':')[1]);

                      if (isPromptLink && typeof onNavigateToPrompt === 'function') {
                          return (
                              <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigateToPrompt(target); }} className="text-primary hover:underline font-medium cursor-pointer relative z-20" title={`Go to prompt: ${target}`}>
                                  {children}
                              </a>
                          );
                      }
                      if (isSnippetLink && typeof onNavigateToSnippet === 'function') {
                          return (
                              <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigateToSnippet(target); }} className="text-blue-500 hover:underline font-medium cursor-pointer relative z-20" title={`Go to snippet: ${target}`}>
                                  {children}
                              </a>
                          );
                      }
                  }
                  
                  return (
                    <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline relative z-20" onClick={(e) => e.stopPropagation()}>
                      {children}
                    </a>
                  )
                },
                img: ({ node, alt, src, ...props }) => {
                  const safeSrc = (src || '').trim();
                  let isSafeImg = false;
                  
                  if (safeSrc.startsWith('data:image/')) {
                      isSafeImg = true;
                  } else {
                      try {
                          const urlObj = new URL(safeSrc);
                          isSafeImg = ['http:', 'https:'].includes(urlObj.protocol);
                      } catch (e) {
                          isSafeImg = false;
                      }
                  }

                  if (!isSafeImg) return null; 

                  let width = undefined;
                  let cleanAlt = alt;

                  const SEP = (alt && alt.includes('=')) ? '=' : (alt && alt.includes('|')) ? '|' : null;
                  if (SEP) {
                      const parts = alt.split(SEP);
                      if (parts.length >= 2 && /^\d+(px|%)?$/.test(parts[parts.length - 1].trim())) {
                          width = parts[parts.length - 1].trim();
                          cleanAlt = parts.slice(0, -1).join(SEP === '|' ? '|' : '=').trim();
                      }
                  }

                  return (
                      <img
                          {...props}
                          src={safeSrc}
                          alt={cleanAlt}
                          style={width
                              ? { width: width, maxWidth: '100%', maxHeight: '96px', objectFit: 'cover' }
                              : { maxWidth: '100%', maxHeight: '96px', objectFit: 'contain' }}
                          className="rounded-lg shadow-sm border border-border/50 my-1 block"
                      />
                  );
                },
                pre: ({ node, ...props }) => <>{props.children}</>,
              }}
            >
              {replaceLeanLinksOutsideCode(((() => {
                let text = '';
                try {
                  text = compilePrompt(resolveSnippets(tile.content || '', snippets), {});
                } catch(e) {
                  text = stripComments(tile.content || '');
                }

                const images = [];
                const lines = text.split('\n');
                const nonTableLines = [];

                lines.forEach(line => {
                  if (line.includes('|')) {
                    nonTableLines.push(line); 
                  } else {
                    const cleanedLine = line.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)]+)\)/g, (match, alt, src) => {
                      images.push({ alt, src });
                      return '';
                    });
                    nonTableLines.push(cleanedLine);
                  }
                });

                text = nonTableLines.join('\n').slice(0, 300);

                if (images.length > 0) {
                    text = `![${images[0].alt}](${images[0].src})\n\n` + text;
                }

                return text;
              })()), snippets)}
            </ReactMarkdown>
          </MarkdownErrorBoundary>
        </div>
      </div>

      {/* FOOTER DATE */}
      <div className="mt-auto pt-3 border-t border-border/50 flex items-center gap-1 text-[10px] text-text-muted font-medium"
        title={tile.createdAt ? `Created: ${new Date(tile.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Creation date unknown'}>
        <Clock size={10} />
        <span>{tile.updatedAt ? new Date(tile.updatedAt).toLocaleDateString() : 'Just now'}</span>
      </div>

    </div >
  );
});
Tile.displayName = 'Tile';

/**
 * KNOWLEDGE BASE MODULE
  * An interactive tile system for managing prompt engineering knowledge.
 * Allows adding, editing, and deleting learning content and guides.
 */
export default function KnowledgeBase({
  tiles,
  onAdd,
  onEdit,
  onDelete,
  prompts = [], // For autocomplete in the editor
  snippets = [], // For snippet autocomplete
  activeCollectionId, // Filter
  selectedTags = [], // Filter
  onRemoveTag, // <-- NEU: Sicherer Callback zum Löschen einzelner Tags
  onClearTags, // <-- NEU: Sicherer Callback zum Löschen aller Tags
  tags = [], // Global tags
  collections = [], // Global collections

  onCreateCollection,
  searchQuery = "", // Lifted State
  onSearchChange, // Lifted State handler
  onBulkDelete, // New Prop
  onNavigateToPrompt,
  onNavigateToSnippet,
  pendingKbId,
  onClearPendingKb,
  kbBacklinks = {},
  onOpenPromptNote,
  onNotification,
  isDarkMode
}) {
  const { setActiveCollection } = usePromptStore();
  const activeCollection = collections.find(c => c.id === activeCollectionId);

  const [editingTile, setEditingTile] = useState(null);
  const [isNewTile, setIsNewTile] = useState(false);
  // const [searchQuery, setSearchQuery] = useState(""); // Lifted to Dashboard
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("kb_view_mode");
    return (saved === "grid" || saved === "list") ? saved : "grid";
  });

  const updateViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("kb_view_mode", mode);
  };

  const [sortMode, setSortMode] = useState("updated"); // "updated" | "title" | "created" | "accessed"
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Selection State
  const [selectedTileIds, setSelectedTileIds] = useState([]);
  const [tagEditorConfig, setTagEditorConfig] = useState({ isOpen: false, anchorRect: null, initialTags: [] });

  // SYNC: If tiles are deleted out-of-band (or via onDelete), remove them from selection
  useEffect(() => {
    setSelectedTileIds(prev => prev.filter(id => tiles.some(t => t.id === id)));
  }, [tiles]);

  const [isBulkCollectionOpen, setIsBulkCollectionOpen] = useState(false);

  // PERF: Pre-compute collection lookup map to avoid O(n) find() per tile
  const collectionMap = React.useMemo(() => {
    const map = new Map();
    collections.forEach(c => map.set(c.id, c));
    return map;
  }, [collections]);

  const [tileCollectionDropdown, setTileCollectionDropdown] = useState(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const [backlinkDropdownOpen, setBacklinkDropdownOpen] = useState(null);
  const [backlinkPopupPos, setBacklinkPopupPos] = useState({ top: 0, left: 0 });

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPopupPos, setMenuPopupPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const closeMenu = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [activeMenuId]);

  const sortOptions = [
    { id: 'updated', label: 'Updated', icon: Clock },
    { id: 'title', label: 'A-Z Title', icon: SortAsc },
    { id: 'created', label: 'Created', icon: Calendar },
    { id: 'accessed', label: 'Accessed', icon: ArrowUpDown },
  ];

  // --- HANDLERS ---
  const handleStartEdit = (tile) => {
    setEditingTile(tile);
    setIsNewTile(false);
  };

  const handleStartAdd = () => {
    const newTile = {
      id: crypto.randomUUID(),
      title: "",
      content: "",
      tags: [],
      collectionId: activeCollectionId || null,
      isPinned: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    setEditingTile(newTile);
    setIsNewTile(true);
  };

  // Handle deep-linked/pending KB tiles
  useEffect(() => {
    if (pendingKbId && tiles.length > 0) {
      const tile = tiles.find(t => t.id === pendingKbId);
      if (tile) {
        handleStartEdit(tile);
        onClearPendingKb();
      }
    }
  }, [pendingKbId, tiles]);

  const handleSave = (updatedTile, updateTimestamp = true) => {
    if (updateTimestamp) {
      updatedTile.updatedAt = new Date().toISOString();
    }
    // Ensure createdAt exists for legacy tiles
    if (!updatedTile.createdAt) updatedTile.createdAt = updatedTile.updatedAt || new Date().toISOString();

    const exists = tiles.find(t => t.id === updatedTile.id);
    if (exists) {
      onEdit(updatedTile);
    } else {
      onAdd(updatedTile);
      // AUTO-SELECT: Highlight the new note immediately so it's easy to find
      setSelectedTileIds(prev => [...prev, updatedTile.id]);
    }
    setEditingTile(null);
  };

  // --- SELECTION HANDLERS ---
  const toggleSelection = (e, id) => {
    e.stopPropagation();
    if (selectedTileIds.includes(id)) {
      setSelectedTileIds(prev => prev.filter(tid => tid !== id));
    } else {
      setSelectedTileIds(prev => [...prev, id]);
    }
  };

  const handleSelectAll = (filtered) => {
    if (filtered.length === 0) return;
    const allSelected = filtered.every(t => selectedTileIds.includes(t.id));
    if (allSelected) {
      // Deselect filtered
      const filteredIds = filtered.map(t => t.id);
      setSelectedTileIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      // Select filtered
      const filteredIds = filtered.map(t => t.id);
      const newSet = new Set([...selectedTileIds, ...filteredIds]);
      setSelectedTileIds(Array.from(newSet));
    }
  };

  // --- BULK ACTIONS ---
  const handleBulkDelete = () => {
    // Delegate to Dashboard's bulk handler which handles confirmation once
    if (onBulkDelete) {
      onBulkDelete(selectedTileIds);
      setSelectedTileIds([]);
    }
  };

  const handleBulkAddTags = (e) => {
    // Open Tag Editor
    // Typically we add tags to all.
    const rect = e.currentTarget.getBoundingClientRect();
    setTagEditorConfig({
      isOpen: true,
      anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
      initialTags: [],
      ids: selectedTileIds,
      isBulk: true
    });
  };

  const saveBulkTags = (newTags, mode) => {
    // mode 'append' or 'replace'.
    const targetIds = tagEditorConfig.ids || [];
    targetIds.forEach(id => {
      const tile = tiles.find(t => t.id === id);
      if (tile) {
        let updatedTags = [...(tile.tags || [])];
        if (mode === 'replace') {
          updatedTags = newTags;
        } else if (mode === 'remove') {
          updatedTags = updatedTags.filter(t => !newTags.includes(t));
        } else {
          // Append unique
          newTags.forEach(t => {
            if (!updatedTags.includes(t)) updatedTags.push(t);
          });
        }
        onEdit({ ...tile, tags: updatedTags });
      }
    });
  };

  const handleBulkAddToCollection = () => {
    setIsBulkCollectionOpen(true);
  };

  const bulkAssignCollections = (collectionId) => {
    selectedTileIds.forEach(id => {
      const tile = tiles.find(t => t.id === id);
      if (tile) {
        onEdit({ ...tile, collectionId: collectionId });
      }
    });
    setIsBulkCollectionOpen(false);
    setSelectedTileIds([]);
  };


  // --- FILTER & SORT LOGIC ---
  const filteredTiles = useMemo(() => {
    return tiles.filter(tile => {
      // 1. Sidebar Collection Filter
      const tileColId = tile.collectionId || tile.collectionIds?.[0];
      if (activeCollectionId && tileColId !== activeCollectionId) return false;

      // 2. Sidebar Tag Filter (AND Logic)
      if (selectedTags.length > 0) {
        const tileTags = tile.tags || [];
        const hasAllTags = selectedTags.every(tag => tileTags.includes(tag));
        if (!hasAllTags) return false;
      }

      // 3. Local Search
      if (searchQuery) {
        const lower = String(searchQuery).toLowerCase();
        return String(tile.title || "").toLowerCase().includes(lower) || String(tile.content || "").toLowerCase().includes(lower);
      }
      return true;
    }).sort((a, b) => {
      // Helper for safe time extraction
      const getTime = (dateStr) => {
        if (!dateStr) return 0;
        const t = new Date(dateStr).getTime();
        return isNaN(t) ? 0 : t;
      };

      // 1. Dynamic Sort
      let result = 0;
      if (sortMode === 'title') {
        result = (a.title || "").localeCompare(b.title || "");
      } else if (sortMode === 'created') {
        const tA = getTime(a.createdAt || a.updatedAt);
        const tB = getTime(b.createdAt || b.updatedAt);
        result = tB - tA; // Newest first
      } else if (sortMode === 'accessed') {
        const tA = getTime(a.updatedAt);
        const tB = getTime(b.updatedAt);
        result = tB - tA;
      } else {
        // Default: Updated
        const tA = getTime(a.updatedAt);
        const tB = getTime(b.updatedAt);
        result = tB - tA;
      }

      // 2. Deterministic Tie-Breaker (Title -> ID)
      if (result === 0) {
        const titleCompare = (a.title || "").localeCompare(b.title || "");
        if (titleCompare !== 0) return titleCompare;
        return (a.id || "").localeCompare(b.id || "");
      }
      return result;
    });
  }, [tiles, activeCollectionId, selectedTags, searchQuery, sortMode]);

  const pinnedTiles = useMemo(() => filteredTiles.filter(t => t.isPinned), [filteredTiles]);
  const regularTiles = useMemo(() => filteredTiles.filter(t => !t.isPinned), [filteredTiles]);

  const allFilteredSelected = filteredTiles.length > 0 && filteredTiles.every(t => selectedTileIds.includes(t.id));


  return (
    <div className="flex-1 w-full flex flex-col h-full bg-bg relative overflow-hidden">
      {/* 0. HEADER SECTION */}
      <header className="flex-none p-4 md:p-6 pb-0 flex flex-col gap-4 z-10 bg-bg">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-subtle rounded-xl shadow-inner outline outline-1 outline-primary/10">
                <BookOpen size={28} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-text-main tracking-tight">
                Knowledge Base
              </h2>
            </div>
            <p className="text-text-muted text-xs font-medium ml-1 opacity-80">
              Manage and organize your personal repository.
            </p>
          </div>
        </div>

        {/* SEARCH & VIEW TOGGLE BAR */}
        <div className="flex items-center gap-3 w-fit bg-bg-surface p-1.5 rounded-xl border border-border shadow-sm relative z-20">
          <div className="flex items-center gap-2 px-2 shrink-0 border-r border-border mr-1 pr-4 cursor-pointer group/selectall" onClick={() => handleSelectAll(filteredTiles)}>
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allFilteredSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}
              title="Select All Visible"
            >
              {allFilteredSelected && <Check size={10} className="text-white" strokeWidth={4} />}
            </div>
            <span className="text-xs font-medium text-text-muted select-none group-hover/selectall:text-text-main transition-colors">
              Select All
            </span>
          </div>

          <div className="w-[400px] shrink-0">
            <SearchInput
              placeholder="Search knowledge..."
              value={searchQuery}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              onClear={() => onSearchChange && onSearchChange("")}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="h-6 w-px bg-border mx-1 shrink-0"></div>

          {/* SORT BUTTON */}
          <div className="relative">
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all ${isSortOpen ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
              title="Sort Tiles"
            >
              <ArrowUpDown size={14} />
              <span className="text-xs font-bold">Sort</span>
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)}></div>
                <div className="absolute top-full left-0 mt-2 w-48 bg-bg-surface border border-border rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.2)] z-50 p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                    <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Sort by</span>
                  </div>
                  {sortOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setSortMode(opt.id); setIsSortOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${sortMode === opt.id ? 'bg-primary-subtle text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <opt.icon size={14} className={sortMode === opt.id ? 'text-primary' : 'text-text-faint'} />
                        {opt.label}
                      </div>
                      {sortMode === opt.id && <Check size={12} className="text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex bg-bg-secondary rounded-lg p-1 gap-1 relative z-10 border border-border/50">
            <button
              onClick={() => updateViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-bg-surface text-primary shadow-sm ring-1 ring-border/20' : 'text-text-muted hover:text-text-main'}`}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => updateViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-bg-surface text-primary shadow-sm ring-1 ring-border/20' : 'text-text-muted hover:text-text-main'}`}
              title="List View"
            >
              <LayoutList size={14} />
            </button>
          </div>

          <div className="h-6 w-px bg-border mx-1 shrink-0"></div>

          {/* ADD NOTE BUTTON (Integrated Right) */}
          <button
            onClick={handleStartAdd}
            className="flex items-center gap-2 bg-primary text-white pl-3 pr-4 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all shrink-0 mr-1"
          >
            <Plus size={14} /> Add Note
          </button>
        </div>

        {/* Active Filter Bar */}
        <div className="pt-4">
          <ActiveFilterBar
            activeCollection={activeCollection}
            selectedTags={selectedTags}
            searchQuery={searchQuery}
            onClearCollection={() => setActiveCollection(null)}
            onRemoveTag={onRemoveTag}
            onClearSearch={() => onSearchChange && onSearchChange("")}
            onClearAll={() => {
              setActiveCollection(null);
              if (onClearTags) onClearTags();
              if (onSearchChange) onSearchChange("");
            }}
            layout="contained"
          />
        </div>
      </header>

      {/* 2. SCROLLABLE CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-16">
        {/* STATS BAR */}
        <div className="mb-4 px-1 flex items-center justify-between text-xs font-medium text-text-muted/60 select-none">
          <span>Showing {filteredTiles.length} of {tiles.length} notes</span>
          {selectedTileIds.length > 0 && (
            <span className="text-primary">{selectedTileIds.length} selected</span>
          )}
        </div>


        {filteredTiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 bg-bg-surface border border-border rounded-2xl flex items-center justify-center mb-4 shadow-sm text-text-muted/20">
              <Search size={32} />
            </div>
            {(tiles && tiles.length > 0) ? (
              <>
                <h3 className="text-lg font-bold text-text-main mb-1">No notes found</h3>
                <p className="text-sm text-text-muted max-w-xs mx-auto">
                  No knowledge tiles match your current filters.
                </p>
                <p className="text-xs text-text-muted mt-2 max-w-[260px] leading-relaxed">
                  {activeCollectionId && collections?.length > 0 && (
                    <>Viewing collection: <span className="font-semibold text-primary">{collections.find(c => c.id === activeCollectionId)?.name || 'Unknown'}</span>. </>
                  )}
                  {selectedTags?.length > 0 && (
                    <>Filtered by {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''}. </>
                  )}
                  {searchQuery && (
                    <>Search: "<span className="font-semibold">{searchQuery}</span>". </>
                  )}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange && onSearchChange("")}
                    className="mt-4 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-all"
                  >
                    Clear search
                  </button>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-text-main mb-1">Knowledge Base empty</h3>
                <p className="text-sm text-text-muted max-w-xs mx-auto">
                  You haven't created any notes yet. Click <span className="font-bold">"Add Note"</span> above to get started.
                </p>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="flex flex-col gap-8">
            {/* --- PINNED SECTION (Row-wise) --- */}
            {pinnedTiles.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Pin size={14} className="text-prompt-accent fill-prompt-accent" />
                  <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Pinned Notes</span>
                  <div className="h-px bg-border/40 flex-1 ml-2"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {pinnedTiles.map(tile => (
                    <Tile
                      key={tile.id}
                      tile={tile}
                      snippets={snippets}
                      isSelected={selectedTileIds.includes(tile.id)}
                      collections={collections}
                      toggleSelection={toggleSelection}
                      onStartEdit={handleStartEdit}
                      onSave={handleSave}
                      onDelete={onDelete}
                      onTranslate={() => { }} // Placeholder
                      onNavigateToPrompt={onNavigateToPrompt}
                      onNavigateToSnippet={onNavigateToSnippet}
                      setTagEditorConfig={setTagEditorConfig}
                      tileCollectionDropdown={tileCollectionDropdown}
                      setTileCollectionDropdown={setTileCollectionDropdown}
                      isCreatingCollection={isCreatingCollection}
                      setIsCreatingCollection={setIsCreatingCollection}
                      newCollectionName={newCollectionName}
                      setNewCollectionName={setNewCollectionName}
                      onCreateCollection={onCreateCollection}
                      onEdit={onEdit}
                      backlinks={kbBacklinks[tile.id] || []}
                      onOpenPromptNote={onOpenPromptNote}
                      onOpenKnowledgeTile={(id) => onSearchChange(tiles.find(t => t.id === id)?.title)}
                      backlinkDropdownOpen={backlinkDropdownOpen}
                      setBacklinkDropdownOpen={setBacklinkDropdownOpen}
                      backlinkPopupPos={backlinkPopupPos}
                      setBacklinkPopupPos={setBacklinkPopupPos}
                      activeMenuId={activeMenuId}
                      setActiveMenuId={setActiveMenuId}
                      menuPopupPos={menuPopupPos}
                      setMenuPopupPos={setMenuPopupPos}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* --- REGULAR SECTION (Masonry Grid) --- */}
            <div className="space-y-4">
              {pinnedTiles.length > 0 && regularTiles.length > 0 && (
                <div className="flex items-center gap-2 px-1 pt-4">
                  <LayoutGrid size={14} className="text-text-muted/40" />
                  <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Other Notes</span>
                  <div className="h-px bg-border/40 flex-1 ml-2"></div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {regularTiles.map(tile => (
                  <Tile
                    key={tile.id}
                    tile={tile}
                    snippets={snippets}
                    isSelected={selectedTileIds.includes(tile.id)}
                    collections={collections}
                    toggleSelection={toggleSelection}
                    onStartEdit={handleStartEdit}
                    onSave={handleSave}
                    onDelete={onDelete}
                    onTranslate={() => { }} // Placeholder
                    onNavigateToPrompt={onNavigateToPrompt}
                    onNavigateToSnippet={onNavigateToSnippet}
                    setTagEditorConfig={setTagEditorConfig}
                    tileCollectionDropdown={tileCollectionDropdown}
                    setTileCollectionDropdown={setTileCollectionDropdown}
                    isCreatingCollection={isCreatingCollection}
                    setIsCreatingCollection={setIsCreatingCollection}
                    newCollectionName={newCollectionName}
                    setNewCollectionName={setNewCollectionName}
                    onCreateCollection={onCreateCollection}
                    onEdit={onEdit}
                    backlinks={kbBacklinks[tile.id] || []}
                    onOpenPromptNote={onOpenPromptNote}
                    onOpenKnowledgeTile={(id) => onSearchChange(tiles.find(t => t.id === id)?.title)}
                    backlinkDropdownOpen={backlinkDropdownOpen}
                    setBacklinkDropdownOpen={setBacklinkDropdownOpen}
                    backlinkPopupPos={backlinkPopupPos}
                    setBacklinkPopupPos={setBacklinkPopupPos}
                    activeMenuId={activeMenuId}
                    setActiveMenuId={setActiveMenuId}
                    menuPopupPos={menuPopupPos}
                    setMenuPopupPos={setMenuPopupPos}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          // --- LIST VIEW ---
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-bg-elevated border-b border-border text-text-muted">
                  <th className="p-4 w-12 text-center">
                    {/* Select All in Header */}
                    <button
                      onClick={() => handleSelectAll(filteredTiles)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allFilteredSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}
                    >
                      {allFilteredSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                    </button>
                  </th>
                  <th className="p-4 font-medium w-12"></th>
                  <th className="p-4 font-medium">Title</th>
                  <th className="p-4 font-medium">Collection</th>
                  <th className="p-4 font-medium">Tags</th>
                  <th className="p-4 font-medium hidden md:table-cell">Last Edited</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTiles.map(tile => {
                  const isSelected = selectedTileIds.includes(tile.id);
                  // COLLECTION COLOR: O(1) lookup via memoized map
                  const listColId = tile.collectionId || tile.collectionIds?.[0];
                  const listCol = listColId ? collectionMap.get(listColId) : null;
                  const listColColor = listCol?.color || null;
                  const listColOpacity = listCol?.colorOpacity != null ? listCol.colorOpacity : undefined;
                  const listRowStyle = !isSelected ? getCollectionListRowStyle(listColColor, listColOpacity) : {};
                  return (
                    <tr
                      key={tile.id}
                      className={`group hover:bg-bg-hover/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                      style={listRowStyle}
                      onClick={() => handleStartEdit(tile)}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center mx-auto cursor-pointer transition-all ${isSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main opacity-30 group-hover:opacity-100'}`}
                          onClick={(e) => toggleSelection(e, tile.id)}
                        >
                          {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {tile.isPinned && <Pin size={16} className="text-primary fill-current" />}
                      </td>
                      <td className="p-4 font-medium text-text-main">
                        {tile.title || "Untitled"}
                      </td>
                      <td className="p-4">
                        {(() => {
                          // FIX: Collection Display Logic
                          const colId = tile.collectionId || tile.collectionIds?.[0];
                          if (!colId) return <span className="text-text-muted/50 text-xs">-</span>;

                          const col = collections.find(c => c.id === colId);
                          // Fallback rendering for orphaned IDs (matches Grid View behavior)
                          return (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col?.color || '#6366f1' }}></div>
                              <span className="text-sm text-text-muted truncate max-w-[120px]" title={col?.name || "Unknown Collection"}>
                                {col?.name || <span className="italic opacity-50">Unknown</span>}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5 h-6 overflow-hidden max-w-[200px]">
                          <DynamicTagList tags={tile.tags || []} maxTagWidth={80} />
                        </div>
                      </td>
                      <td
                        className="p-4 text-text-muted hidden md:table-cell"
                        title={tile.createdAt ? `Created: ${new Date(tile.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Creation date unknown'}
                      >
                        {tile.updatedAt ? new Date(tile.updatedAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(tile.id);
                          }}
                          className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="h-32 w-full flex-shrink-0" />
      </div>

      {/* BULK ACTION BAR */}
      <BulkActionBar
        selectedCount={selectedTileIds.length}
        onClearSelection={() => setSelectedTileIds([])}
        onDelete={handleBulkDelete}
        onAddTags={handleBulkAddTags}
        onAddToCollection={handleBulkAddToCollection}
      />

      {/* BULK COLLECTION DROPDOWN */}
      {
        isBulkCollectionOpen && selectedTileIds.length > 0 && (
          <>
            <div className="fixed inset-0 z-[998]" onClick={() => { setIsBulkCollectionOpen(false); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-64 bg-bg-surface border border-border rounded-xl shadow-2xl z-[999] p-1 animate-in fade-in slide-in-from-bottom-2 duration-150 dm-dropdown">
              <div className="px-3 py-2 border-b border-border/50 font-bold text-xs text-text-muted uppercase tracking-wider mb-1 flex justify-between items-center">
                <span>Move {selectedTileIds.length} items to...</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                  className="p-1 hover:bg-bg-hover rounded text-primary"
                  title="New Collection"
                >
                  <Plus size={12} />
                </button>
              </div>

              {isCreatingCollection && (
                <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                      placeholder="Name..."
                      value={newCollectionName}
                      onChange={e => setNewCollectionName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newCollectionName.trim()) {
                          e.stopPropagation();
                          if (onCreateCollection) {
                            const newId = crypto.randomUUID();
                            await onCreateCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                            bulkAssignCollections(newId);
                          }
                          setNewCollectionName("");
                          setIsCreatingCollection(false);
                          setIsBulkCollectionOpen(false);
                          setSelectedTileIds([]);
                        }
                      }}
                    />
                    <button
                      className="p-1 hover:text-red-400"
                      onClick={() => setIsCreatingCollection(false)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
                <button
                  onClick={() => bulkAssignCollections(null)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors text-left"
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-400"></div>
                  <span className="truncate">None (Uncategorized)</span>
                </button>
                {collections.map(col => (
                  <button
                    key={col.id}
                    onClick={() => bulkAssignCollections(col.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-main transition-colors text-left"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                    <span className="truncate">{col.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      }

      {/* EDITOR OVERLAY (Portal: avoids overflow-hidden clipping from parent) */}
      {
        editingTile && createPortal(
          <KnowledgeTileEditor
            isOpen={!!editingTile}
            onClose={() => setEditingTile(null)}
            onSave={handleSave}
            prompts={prompts}
            snippets={snippets}
            tile={editingTile}
            tags={tags}
            collections={collections}
            onCreateCollection={onCreateCollection}
            onNavigateToPrompt={onNavigateToPrompt}
            onNavigateToSnippet={onNavigateToSnippet}
            onNotification={onNotification}
            isDarkMode={isDarkMode}
          />,
          document.body
        )
      }

      {/* CONFIRM MODAL */}

      {/* TAG EDITOR POPOVER */}
      <TagEditorPopover
        isOpen={tagEditorConfig.isOpen}
        onClose={() => setTagEditorConfig(prev => ({ ...prev, isOpen: false }))}
        onSave={saveBulkTags}
        initialTags={tagEditorConfig.initialTags}
        availableTags={tags.map(t => t.name || t)} // global tags
        isBulk={tagEditorConfig.isBulk}
        anchorRect={tagEditorConfig.anchorRect}
      />

    </div >
  );
}
