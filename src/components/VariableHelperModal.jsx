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
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Check, Plus, Type, ListFilter, UploadCloud, Zap,
    FileText, Calendar, Clock, Hash, Globe, AlertCircle, Copy
} from 'lucide-react';
import useBodyLock from '../hooks/useBodyLock';
import { serializeVariableTag, parseVariableTag } from '../utils/variableParser';

const MACRO_PRESETS = [
    { id: '$date', label: 'Current Date', icon: Calendar, description: 'Inserts current date (e.g. 10/24/2026)' },
    { id: '$time', label: 'Current Time', icon: Clock, description: 'Inserts current time (e.g. 14:30)' },
    { id: '$day', label: 'Weekday', icon: Calendar, description: 'Inserts day of the week (e.g. Monday)' },
    { id: '$uuid', label: 'Unique ID', icon: Hash, description: 'Generates random UUID' },
    { id: '$language', label: 'Browser Locale', icon: Globe, description: 'Browser language (e.g. en-US)' }
];

export default function VariableHelperModal({
    isOpen,
    onClose,
    mode = 'create', // 'create' | 'edit'
    initialConfig = null,
    initialText = '',
    targetRange = null, // { from, to } for edit mode
    onApply
}) {
    useBodyLock();

    const [activeTab, setActiveTab] = useState('text'); // 'text' | 'dropdown' | 'file' | 'macro'
    const [varName, setVarName] = useState('');
    const [defaultValue, setDefaultValue] = useState('');
    const [isRequired, setIsRequired] = useState(false);
    const [options, setOptions] = useState([]);
    const [newOptionInput, setNewOptionInput] = useState('');
    const [selectedMacro, setSelectedMacro] = useState('$date');
    const [copied, setCopied] = useState(false);

    const nameInputRef = useRef(null);
    const optionInputRef = useRef(null);

    // Initialize or reset form state whenever modal opens or target changes
    useEffect(() => {
        if (!isOpen) return;

        if (initialConfig) {
            setActiveTab(initialConfig.type || 'text');
            setVarName(initialConfig.name || '');
            setDefaultValue(initialConfig.defaultValue || '');
            setIsRequired(Boolean(initialConfig.isRequired));
            setOptions(Array.isArray(initialConfig.options) && initialConfig.options.length > 0 ? initialConfig.options : ['Option 1', 'Option 2']);
            setSelectedMacro(initialConfig.macroName || '$date');
        } else if (initialText) {
            // Check if selected text is already a variable syntax
            const trimmed = initialText.trim();
            if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
                const parsed = parseVariableTag(trimmed);
                setActiveTab(parsed.type || 'text');
                setVarName(parsed.name || '');
                setDefaultValue(parsed.defaultValue || '');
                setIsRequired(Boolean(parsed.isRequired));
                setOptions(parsed.options?.length > 0 ? parsed.options : ['Option 1', 'Option 2']);
                setSelectedMacro(parsed.macroName || '$date');
            } else {
                setActiveTab('text');
                setVarName(trimmed.replace(/[{}[\]]/g, ''));
                setDefaultValue('');
                setIsRequired(false);
                setOptions(['Option 1', 'Option 2']);
                setSelectedMacro('$date');
            }
        } else {
            setActiveTab('text');
            setVarName('');
            setDefaultValue('');
            setIsRequired(false);
            setOptions(['Option 1', 'Option 2']);
            setSelectedMacro('$date');
        }

        setNewOptionInput('');
        setCopied(false);

        // Autofocus name input after render
        const timer = setTimeout(() => {
            if (nameInputRef.current) {
                nameInputRef.current.focus();
                nameInputRef.current.select();
            }
        }, 80);
        return () => clearTimeout(timer);
    }, [isOpen, initialConfig, initialText]);

    // Compute live syntax output
    const liveSyntax = useMemo(() => {
        return serializeVariableTag({
            type: activeTab,
            name: varName,
            defaultValue,
            options,
            isRequired,
            macroName: selectedMacro
        });
    }, [activeTab, varName, defaultValue, options, isRequired, selectedMacro]);

    // Handle adding an option chip for dropdowns
    const handleAddOption = () => {
        const trimmed = newOptionInput.trim();
        if (!trimmed) return;

        // Support comma-separated batch adding (e.g. "Low, Medium, High")
        if (trimmed.includes(',')) {
            const added = trimmed.split(',').map(s => s.trim()).filter(Boolean);
            setOptions(prev => [...prev, ...added]);
        } else {
            setOptions(prev => [...prev, trimmed]);
        }
        setNewOptionInput('');
        if (optionInputRef.current) optionInputRef.current.focus();
    };

    const handleRemoveOption = (indexToRemove) => {
        setOptions(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const handleKeyDownOptionInput = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddOption();
        }
    };

    // Global KeyDown (Enter to submit, Escape to close)
    const handleModalKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            // If focused in the new-option input, add the option instead of submitting
            if (document.activeElement === optionInputRef.current) {
                return;
            }
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleSubmit = () => {
        // Fallback for empty variable name
        let finalName = varName.trim();
        if (activeTab !== 'macro' && !finalName) {
            finalName = activeTab === 'file' ? 'Document' : 'Variable';
        }

        const syntax = serializeVariableTag({
            type: activeTab,
            name: finalName,
            defaultValue,
            options: options.length > 0 ? options : ['Option 1', 'Option 2'],
            isRequired,
            macroName: selectedMacro
        });

        if (onApply) {
            onApply({
                syntax,
                mode,
                from: targetRange?.from,
                to: targetRange?.to
            });
        }
        onClose();
    };

    const handleCopySyntax = () => {
        navigator.clipboard?.writeText(liveSyntax);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="portal-root">
                <div
                    className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />

                <div
                    className="fixed inset-0 z-[9995] flex items-center justify-center p-4 select-none pointer-events-none"
                    onKeyDown={handleModalKeyDown}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="pointer-events-auto w-full max-w-lg bg-gradient-to-br from-bg-surface to-bg-elevated border border-border/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-bg-surface/50">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                    <Type size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-text-main leading-tight">
                                        {mode === 'edit' ? 'Edit Variable' : 'Insert Variable'}
                                    </h3>
                                    <p className="text-[11px] text-text-muted leading-tight mt-0.5">
                                        {mode === 'edit'
                                            ? 'Modify syntax, rules, and default values'
                                            : 'Configure dynamic inputs, files, or system macros'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
                                title="Close (Esc)"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Segmented Type Switcher */}
                        <div className="p-5 pb-3">
                            <div className="grid grid-cols-4 gap-1 p-1 bg-bg-secondary rounded-xl border border-border/40 text-xs font-medium">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('text')}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                                        activeTab === 'text'
                                            ? 'bg-primary text-white shadow-sm font-bold'
                                            : 'text-text-muted hover:text-text-main hover:bg-bg-surface/50'
                                    }`}
                                >
                                    <FileText size={13} />
                                    <span>Text</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('dropdown')}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                                        activeTab === 'dropdown'
                                            ? 'bg-primary text-white shadow-sm font-bold'
                                            : 'text-text-muted hover:text-text-main hover:bg-bg-surface/50'
                                    }`}
                                >
                                    <ListFilter size={13} />
                                    <span>Dropdown</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('file')}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                                        activeTab === 'file'
                                            ? 'bg-primary text-white shadow-sm font-bold'
                                            : 'text-text-muted hover:text-text-main hover:bg-bg-surface/50'
                                    }`}
                                >
                                    <UploadCloud size={13} />
                                    <span>File</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('macro')}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                                        activeTab === 'macro'
                                            ? 'bg-primary text-white shadow-sm font-bold'
                                            : 'text-text-muted hover:text-text-main hover:bg-bg-surface/50'
                                    }`}
                                >
                                    <Zap size={13} />
                                    <span>Macro</span>
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-5 py-2 space-y-4 max-h-[360px] overflow-y-auto custom-scrollbar">
                            {activeTab !== 'macro' && (
                                <>
                                    {/* Variable Name */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-main mb-1.5">
                                            {activeTab === 'file' ? 'File / Attachment Label' : 'Variable Name'}
                                        </label>
                                        <input
                                            ref={nameInputRef}
                                            type="text"
                                            value={varName}
                                            onChange={e => setVarName(e.target.value.replace(/[{}[\]]/g, ''))}
                                            placeholder={activeTab === 'file' ? 'e.g. Document or Codebase' : 'e.g. Topic or Audience'}
                                            className="w-full px-3 py-2 bg-bg-surface border border-border/40 focus:border-primary/60 rounded-xl text-xs text-text-main focus:outline-none transition-colors placeholder:text-text-muted/40 font-mono"
                                        />
                                    </div>

                                    {/* Specific fields for Text */}
                                    {activeTab === 'text' && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-xs font-semibold text-text-main">
                                                    Default Value <span className="text-[10px] text-text-muted font-normal">(Optional)</span>
                                                </label>
                                            </div>
                                            <input
                                                type="text"
                                                value={defaultValue}
                                                onChange={e => setDefaultValue(e.target.value)}
                                                placeholder="e.g. General or English"
                                                className="w-full px-3 py-2 bg-bg-surface border border-border/40 focus:border-primary/60 rounded-xl text-xs text-text-main focus:outline-none transition-colors placeholder:text-text-muted/40"
                                            />
                                        </div>
                                    )}

                                    {/* Specific fields for Dropdown */}
                                    {activeTab === 'dropdown' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-text-main mb-1.5">
                                                Options <span className="text-[10px] text-text-muted font-normal">(Press Enter or comma to add)</span>
                                            </label>

                                            <div className="flex items-center gap-2 mb-2">
                                                <input
                                                    ref={optionInputRef}
                                                    type="text"
                                                    value={newOptionInput}
                                                    onChange={e => setNewOptionInput(e.target.value)}
                                                    onKeyDown={handleKeyDownOptionInput}
                                                    placeholder="Type an option and press Enter..."
                                                    className="flex-1 px-3 py-1.5 bg-bg-surface border border-border/40 focus:border-primary/60 rounded-xl text-xs text-text-main focus:outline-none transition-colors placeholder:text-text-muted/40"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddOption}
                                                    disabled={!newOptionInput.trim()}
                                                    className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                                >
                                                    <Plus size={13} />
                                                    <span>Add</span>
                                                </button>
                                            </div>

                                            {/* Options Chips */}
                                            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-bg-surface/50 border border-border/30 rounded-xl">
                                                {options.length === 0 ? (
                                                    <span className="text-[11px] text-text-muted italic px-1">
                                                        No options defined yet. Add at least 2 options.
                                                    </span>
                                                ) : (
                                                    options.map((opt, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium"
                                                        >
                                                            <span>{opt}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveOption(idx)}
                                                                className="text-primary/60 hover:text-primary p-0.5 rounded transition-colors"
                                                            >
                                                                <X size={11} />
                                                            </button>
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Specific Note for File */}
                                    {activeTab === 'file' && (
                                        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs flex items-start gap-2.5">
                                            <UploadCloud size={16} className="shrink-0 mt-0.5" />
                                            <div className="leading-relaxed">
                                                <span>File variables create an interactive <strong>Drag & Drop</strong> upload zone in the Variable Inspector panel.</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Required Checkbox Toggle */}
                                    <div className="pt-1">
                                        <label className="flex items-center gap-2.5 cursor-pointer text-xs text-text-main group">
                                            <input
                                                type="checkbox"
                                                checked={isRequired}
                                                onChange={e => setIsRequired(e.target.checked)}
                                                className="w-4 h-4 rounded border-border/60 text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer accent-primary"
                                            />
                                            <span className="font-semibold group-hover:text-primary transition-colors">
                                                Required Variable <span className="font-mono text-primary font-bold">(!)</span>
                                            </span>
                                        </label>
                                        <p className="text-[11px] text-text-muted mt-0.5 ml-6.5 leading-tight">
                                            Enforces that this field or file must be provided before injection.
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Specific content for Macros */}
                            {activeTab === 'macro' && (
                                <div className="space-y-2">
                                    <span className="text-xs font-semibold text-text-main block mb-1">
                                        Choose Dynamic System Macro:
                                    </span>
                                    <div className="space-y-1.5">
                                        {MACRO_PRESETS.map(macro => {
                                            const IconComp = macro.icon;
                                            const isSelected = selectedMacro === macro.id;
                                            return (
                                                <button
                                                    key={macro.id}
                                                    type="button"
                                                    onClick={() => setSelectedMacro(macro.id)}
                                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                                        isSelected
                                                            ? 'bg-primary/10 border-primary/40 text-primary'
                                                            : 'bg-bg-surface border-border/30 hover:border-border text-text-muted hover:text-text-main'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted'}`}>
                                                            <IconComp size={14} />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold font-mono leading-tight">{`{{${macro.id}}}`}</div>
                                                            <div className="text-[10px] text-text-muted leading-tight mt-0.5">{macro.description}</div>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={14} className="text-primary mr-1" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Live Syntax Preview Bar */}
                        <div className="mx-5 my-3 p-2.5 rounded-xl bg-bg-surface/80 border border-border/40 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider shrink-0">
                                    Preview:
                                </span>
                                <code className="font-mono text-xs text-primary font-bold truncate">
                                    {liveSyntax}
                                </code>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopySyntax}
                                className="shrink-0 p-1 rounded-md text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors flex items-center gap-1 text-[11px]"
                                title="Copy Syntax to Clipboard"
                            >
                                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-border/30 bg-bg-surface/50">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover shadow-md font-bold text-xs transition-all flex items-center gap-1.5 active:scale-[0.98]"
                            >
                                {mode === 'edit' ? (
                                    <>
                                        <Check size={14} />
                                        <span>Update Variable</span>
                                    </>
                                ) : (
                                    <>
                                        <Plus size={14} />
                                        <span>Insert Variable</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </AnimatePresence>
    );
}
