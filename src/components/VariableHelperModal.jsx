/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Type, ListFilter, FolderUp, Zap, X, Copy, Check, Sparkles, Trash2, Plus } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { parseVariableDefinition } from '../utils/variableParser';

export default function VariableHelperModal({
    isOpen,
    onClose,
    onApply,
    hasActiveCursor = true,
    mode = 'create',
    initialData = null
}) {
    const [activeTab, setActiveTab] = useState('text');
    const [name, setName] = useState('');
    const [defaultValue, setDefaultValue] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [isRequired, setIsRequired] = useState(false);
    const [includePrefix, setIncludePrefix] = useState(false);
    const [selectedMacro, setSelectedMacro] = useState('$date');
    const [copied, setCopied] = useState(false);

    // Synchronize state when modal opens or initialData changes
    useEffect(() => {
        if (!isOpen) return;

        if (initialData?.raw) {
            const parsed = parseVariableDefinition(initialData.raw);
            setActiveTab(parsed.type || 'text');
            setName(parsed.name || '');
            setDefaultValue(parsed.defaultValue || '');
            setOptions(parsed.options && parsed.options.length > 0 ? parsed.options : ['', '']);
            setIsRequired(!!parsed.isRequired);
            // In edit mode: if it already had a prefix in the text, pre-check includePrefix!
            setIncludePrefix(!!initialData?.hasExistingPrefix);
            if (parsed.macro) setSelectedMacro(parsed.macro);
        } else {
            setActiveTab('text');
            setName('');
            setDefaultValue('');
            setOptions(['', '']);
            setIsRequired(false);
            setIncludePrefix(false);
            setSelectedMacro('$date');
        }
    }, [isOpen, initialData]);

    // Handle ESC key to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Syntax-Generator
    const cleanName = name.trim();
    const req = isRequired ? '!' : '';
    const displayLabel = cleanName || (activeTab === 'file' ? 'Document' : (activeTab === 'dropdown' ? 'Choice' : 'Topic'));
    let previewSyntax = '';

    if (activeTab === 'macro') {
        previewSyntax = `{{${selectedMacro}}}`;
    } else if (activeTab === 'file') {
        previewSyntax = `{{${req}file:${cleanName || 'Document'}}}`;
    } else if (activeTab === 'dropdown') {
        const validOpts = options.map(o => o.trim()).filter(Boolean);
        const optsStr = validOpts.length > 0 ? `:${validOpts.join('|')}` : '';
        previewSyntax = `{{${req}${cleanName || 'Choice'}${optsStr}}}`;
    } else {
        const defStr = defaultValue.trim() ? `:${defaultValue.trim()}` : '';
        previewSyntax = `{{${req}${cleanName || 'Topic'}${defStr}}}`;
    }

    if (includePrefix && activeTab !== 'macro') {
        previewSyntax = `${displayLabel}: ${previewSyntax}`;
    }

    const handleCopyPreview = async (e) => {
        e.stopPropagation();
        await copyToClipboard(previewSyntax);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleInsert = () => {
        if (!cleanName && activeTab !== 'macro') return;

        // If the variable previously had a prefix in the document, replace the entire "Prefix: {{...}}" range
        // Otherwise replace just the variable range "{{...}}"
        const targetRange = (initialData?.hasExistingPrefix && initialData?.fullRange)
            ? initialData.fullRange
            : initialData?.range;

        if (onApply) {
            onApply(previewSyntax, { ...initialData, range: targetRange });
        }

        window.dispatchEvent(
            new CustomEvent('lp-apply-variable-syntax', {
                detail: {
                    syntax: previewSyntax,
                    range: targetRange,
                    stepId: initialData?.stepId
                }
            })
        );

        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh] md:pt-[12vh] pointer-events-none">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

            {/* Modal Card */}
            <div className="modal-glass-panel w-full max-w-[480px] pointer-events-auto rounded-[28px] p-6 shadow-2xl relative border border-border/80 dark:border-white/10 bg-bg-surface dark:bg-[#131316] text-left">
                
                {/* Deko-Handle */}
                <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-6 opacity-50" />

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center text-primary shrink-0">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main leading-none">
                                {mode === 'edit' ? 'Edit Variable' : 'Insert Variable'}
                            </h3>
                            <p className="text-xs text-text-muted mt-1">
                                {mode === 'edit'
                                    ? 'Update variable configuration'
                                    : (hasActiveCursor ? 'Adds a dynamic placeholder at your cursor position' : 'Appends a dynamic placeholder to your prompt')}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-4 gap-2 mb-6">
                    {[
                        { id: 'text', label: 'Text', icon: Type },
                        { id: 'dropdown', label: 'Dropdown', icon: ListFilter },
                        { id: 'file', label: 'File Zone', icon: FolderUp },
                        { id: 'macro', label: 'System', icon: Zap }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`py-2 px-1 rounded-xl text-xs font-semibold border-2 transition-all flex items-center justify-center gap-2 ${
                                    isActive
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-transparent bg-zinc-100 dark:bg-zinc-800/50 text-text-muted hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="space-y-4">
                    {activeTab !== 'macro' && (
                        <div>
                            <label className="block text-xs font-bold text-text-main mb-1.5">
                                Variable Name
                            </label>
                            <input
                                autoFocus
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Topic, Audience, Role..."
                                className="w-full p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-primary text-sm text-text-main outline-none transition-colors"
                            />
                            <p className="text-xs text-text-muted mt-1">
                                Label shown for this field in the Inspector sidebar.
                            </p>
                        </div>
                    )}

                    {activeTab === 'text' && (
                        <div>
                            <label className="block text-xs font-bold text-text-main mb-1.5">
                                Default Value (Optional)
                            </label>
                            <input
                                type="text"
                                value={defaultValue}
                                onChange={e => setDefaultValue(e.target.value)}
                                placeholder="e.g. General, English..."
                                className="w-full p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-primary text-sm text-text-main outline-none transition-colors"
                            />
                            <p className="text-xs text-text-muted mt-1">
                                Fallback text used if the field is left empty during injection.
                            </p>
                        </div>
                    )}

                    {activeTab === 'dropdown' && (
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-text-main">
                                Dropdown Options
                            </label>
                            <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                {options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => {
                                                    const updated = [...options];
                                                    updated[idx] = e.target.value.replace(/\|/g, '-');
                                                    setOptions(updated);
                                                }}
                                                placeholder={`Option ${idx + 1}...`}
                                                className="w-full py-2.5 pl-3.5 pr-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-primary text-xs text-text-main outline-none transition-colors"
                                            />
                                            {idx === 0 && (
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-primary pointer-events-none">
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                        {options.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                                                className="p-2 text-text-muted hover:text-red-400 rounded-lg transition-colors shrink-0"
                                                title="Remove option"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setOptions([...options, ''])}
                                className="text-xs font-bold text-primary hover:text-primary-hover flex items-center gap-1.5 py-1 px-1 transition-colors"
                            >
                                <Plus size={14} /> Add another option
                            </button>
                            <p className="text-xs text-text-muted">
                                Pre-defined choices selectable in the Inspector sidebar.
                            </p>
                        </div>
                    )}

                    {activeTab === 'file' && (
                        <div className="p-4 rounded-xl bg-primary-subtle border border-primary/20 text-xs text-text-muted leading-relaxed">
                            Creates a dedicated <strong>File Dropzone</strong> in the Inspector sidebar where documents or images can be attached.
                        </div>
                    )}

                    {activeTab === 'macro' && (
                        <div>
                            <label className="block text-xs font-bold text-text-main mb-2">
                                Select System Macro
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: '$date', label: 'Current Date', desc: 'Auto-injects today\'s date' },
                                    { id: '$time', label: 'Current Time', desc: 'Auto-injects current timestamp' },
                                    { id: '$day', label: 'Weekday', desc: 'Auto-injects the current weekday' },
                                    { id: '$uuid', label: 'Unique ID', desc: 'Generates a random UUID' },
                                    { id: '$language', label: 'Browser Language', desc: 'Injects browser locale' }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setSelectedMacro(m.id)}
                                        className={`p-3 rounded-xl text-left border-2 transition-all flex items-center justify-between ${
                                            selectedMacro === m.id
                                                ? 'border-primary bg-primary/5 text-text-main'
                                                : 'border-transparent bg-zinc-100 dark:bg-zinc-800/50 text-text-muted hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        <div>
                                            <div className="font-mono text-xs font-bold text-primary">{m.id}</div>
                                            <div className="text-[11px] text-text-muted">{m.desc}</div>
                                        </div>
                                        {selectedMacro === m.id && <Check size={16} className="text-primary" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Checkboxes */}
                    {activeTab !== 'macro' && (
                        <div className="space-y-2 pt-2">
                            <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none">
                                <div>
                                    <div className="text-xs font-bold text-text-main">Include Label Prefix</div>
                                    <div className="text-[11px] text-text-muted">Prepends label in prompt (e.g. &quot;{displayLabel}: {`{{${cleanName || (activeTab === 'file' ? 'Document' : 'Topic')}}}`}&quot;)</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={includePrefix}
                                    onChange={(e) => setIncludePrefix(e.target.checked)}
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-0 cursor-pointer"
                                />
                            </label>

                            <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none">
                                <div>
                                    <div className="text-xs font-bold text-text-main">Mandatory Field <span className="text-amber-500 font-bold">(!)</span></div>
                                    <div className="text-[11px] text-text-muted">Blocks prompt execution until this field is filled out.</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isRequired}
                                    onChange={(e) => setIsRequired(e.target.checked)}
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-0 cursor-pointer"
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* Preview & Action */}
                <div className="mt-6 pt-4 border-t border-border/50 flex flex-col gap-3">
                    <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-border flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-text-muted">Preview:</span>
                            <span className="font-mono text-xs font-bold text-primary truncate max-w-[300px]">
                                {previewSyntax}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyPreview}
                            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-text-muted hover:text-text-main transition-colors"
                            title="Copy syntax to clipboard"
                        >
                            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                    </div>

                    <button
                        onClick={handleInsert}
                        disabled={!cleanName && activeTab !== 'macro'}
                        className="w-full py-3.5 rounded-xl font-bold bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
                    >
                        <span>{mode === 'edit' ? 'Update Variable' : (hasActiveCursor ? 'Insert at Cursor' : 'Append to Prompt')}</span>
                        <span className="opacity-60 font-mono text-xs">↵</span>
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
}
