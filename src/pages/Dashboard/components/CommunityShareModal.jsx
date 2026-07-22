/**
 * ============================================================================
 * LeanPrompts Studio - Community Share Modal (Fully Unlocked Edition)
 * @author       Ivica Vrgoc
 * @license      AGPL-3.0
 * ============================================================================
 * Decoupled, zero-regression component to handle secure community publishing.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Globe, CheckSquare, Square, Send, AlertTriangle, Layers, BookOpen, Check } from 'lucide-react';
import { scanWorkflowDependencies } from '../../../utils/workflowScan';

const DISCORD_UPLOAD_WORKFLOW_INVITE = "https://discord.gg/PxFrXPhbT";

export default function CommunityShareModal({ isOpen, onClose, prompt, snippets, knowledgeTiles, onNotification }) {
    // 1. Local States
    const [authorName, setAuthorName] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('lp_community_author') || '';
        }
        return '';
    });
    const [description, setDescription] = useState('');
    const [includeHistory, setIncludeHistory] = useState(false);
    const [includeNotes, setIncludeNotes] = useState(true);
    const [includePresets, setIncludePresets] = useState(false);
    const [selectedDependencies, setSelectedDependencies] = useState(new Set());
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishSuccess, setPublishSuccess] = useState(false);

    // 2. Scan for dependencies
    const dependencies = useMemo(() => {
        if (!prompt || !isOpen) return { snippets: [], knowledgeBase: [] };
        return scanWorkflowDependencies(prompt, snippets || [], knowledgeTiles || []);
    }, [prompt, snippets, knowledgeTiles, isOpen]);

    // --- 100% BULLETPROOF SMART DETECTORS (READ-ONLY) ---
    const hasNotes = useMemo(() => {
        if (!prompt) return false;
        return prompt.chain?.some(step => step.notes && step.notes.trim() !== "") || false;
    }, [prompt]);

    const hasHistory = useMemo(() => {
        if (!prompt) return false;
        return prompt.chain?.some(step => step.versions && step.versions.length > 0) || (prompt.versions && prompt.versions.length > 0);
    }, [prompt]);

    const hasPresets = useMemo(() => {
        if (!prompt) return false;
        return prompt.presets && Object.keys(prompt.presets).length > 0;
    }, [prompt]);

    // Initial Sync
    useEffect(() => {
        if (isOpen) {
            setPublishSuccess(false);
            setDescription('');
            setIsPublishing(false);
            setIncludeNotes(hasNotes);
            setIncludeHistory(false); // Default false for performance
            setIncludePresets(false); // Default false for security
            
            const allIds = new Set();
            dependencies.snippets.forEach(s => allIds.add(s.id));
            dependencies.knowledgeBase.forEach(kb => allIds.add(kb.id));
            setSelectedDependencies(allIds);
        }
    }, [isOpen]);

    if (!isOpen || !prompt) return null;

    const toggleDependency = (id) => {
        const newSet = new Set(selectedDependencies);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedDependencies(newSet);
    };

    const handlePublish = async () => {
        const cleanAuthor = authorName.trim();
        const cleanDesc = description.trim();

        if (!cleanAuthor) {
            if (onNotification) onNotification("Please enter an author name.", "warning");
            return;
        }

        setIsPublishing(true);
        try {
            localStorage.setItem('lp_community_author', cleanAuthor);
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ lp_community_author: cleanAuthor });
            }

            const promptToExport = JSON.parse(JSON.stringify(prompt));
            promptToExport.author_name = cleanAuthor;
            promptToExport.description = cleanDesc;

            if (promptToExport.chain) {
                promptToExport.chain = promptToExport.chain.map(step => {
                    const newStep = { ...step };
                    if (!includeHistory) newStep.versions = [];
                    if (!includeNotes) newStep.notes = "";
                    return newStep;
                });
            }
            if (!includeHistory) promptToExport.versions = [];

            if (promptToExport.presets) {
                if (!includePresets) {
                    delete promptToExport.presets;
                } else {
                    Object.keys(promptToExport.presets).forEach(key => {
                        promptToExport.presets[key].files = (promptToExport.presets[key].files || []).map(f => ({
                            name: f.name, type: f.type, size: f.size, isGhost: true
                        }));
                    });
                }
            }

            const snippetsToExport = dependencies.snippets.filter(s => selectedDependencies.has(s.id)).map(s => {
                const newSnip = { ...s };
                if (!includeNotes) newSnip.notes = "";
                return newSnip;
            });
            const kbToExport = dependencies.knowledgeBase.filter(kb => selectedDependencies.has(kb.id));

            const payload = {
                meta: {
                    version: 3,
                    type: 'workflow_bundle',
                    exportedAt: new Date().toISOString(),
                    app: "LeanPrompts"
                },
                prompt: promptToExport,
                snippets: snippetsToExport,
                knowledgeBase: kbToExport
            };

            const response = await fetch("https://leanprompts.app/api/community/share", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "x-lp-auth-token": "lp_handshake_secure_v2"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Gateway rejected submission.");
            }

            setPublishSuccess(true);
            if (onNotification) onNotification("Successfully staged on Discord!", "success");
        } catch (err) {
            console.error("Publish failed:", err);
            if (onNotification) onNotification(err.message || "Failed to publish.", "error");
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-surface border border-border rounded-xl shadow-2xl overflow-hidden max-w-lg w-full flex flex-col max-h-[90vh] dm-modal text-left">
                
                {/* Header */}
                <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-bg-surface shrink-0">
                    <h3 className="font-bold text-text-main flex items-center gap-2">
                        <Globe size={18} className="text-primary" />
                        Share with Community
                    </h3>
                    <button onClick={onClose} disabled={isPublishing} className="p-2 text-text-muted hover:text-text-main rounded-lg transition-colors duration-200 cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-bg space-y-5 custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {!publishSuccess ? (
                            <motion.div key="form" className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                
                                {/* Security Warning */}
                                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-3">
                                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                                    <div className="text-xs text-text-muted leading-relaxed">
                                        <span className="font-bold text-amber-500 block mb-0.5">Privacy Guard</span>
                                        Please review your template steps. Ensure your prompt contains no active API keys, client passwords, or internal database secrets.
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Author Name</label>
                                        <input 
                                            type="text" 
                                            value={authorName} 
                                            onChange={e => setAuthorName(e.target.value)} 
                                            placeholder="Your alias (e.g. Ivica)"
                                            maxLength={30}
                                            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-xs text-text-main focus:border-primary focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Description (Website Card)</label>
                                        <textarea 
                                            value={description} 
                                            onChange={e => setDescription(e.target.value)} 
                                            placeholder="Describe what this prompt does in one sentence..."
                                            maxLength={160}
                                            rows={2}
                                            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-xs text-text-main focus:border-primary focus:outline-none resize-none"
                                        />
                                        <span className="text-[9px] text-text-faint text-right block mt-1">{description.length}/160</span>
                                    </div>
                                </div>

                                {/* Dependencies (Snippets & KB) */}
                                { (dependencies.snippets.length > 0 || dependencies.knowledgeBase.length > 0) && (
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Bundle Dependencies</h4>
                                        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                                            {dependencies.snippets.map(s => (
                                                <div key={s.id} className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors duration-200" onClick={() => toggleDependency(s.id)}>
                                                    <div className={selectedDependencies.has(s.id) ? 'text-primary' : 'text-text-faint'}>
                                                        {selectedDependencies.has(s.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                    </div>
                                                    <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                                                        <Layers size={10} className="text-amber-500" />
                                                    </div>
                                                    <span className="text-xs font-mono font-bold text-text-main truncate">@{s.name}</span>
                                                </div>
                                            ))}
                                            {dependencies.knowledgeBase.map(kb => (
                                                <div key={kb.id} className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors duration-200" onClick={() => toggleDependency(kb.id)}>
                                                    <div className={selectedDependencies.has(kb.id) ? 'text-primary' : 'text-text-faint'}>
                                                        {selectedDependencies.has(kb.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                    </div>
                                                    <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center shrink-0">
                                                        <BookOpen size={10} className="text-orange-500" />
                                                    </div>
                                                    <span className="text-xs font-medium text-text-main truncate">[[{kb.title}]]</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Output Granularity (UNLOCKED EDITION) */}
                                <div className="space-y-1 bg-bg-surface border border-border rounded-lg p-2.5">
                                    <div 
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors duration-200 ${hasNotes ? 'cursor-pointer hover:bg-bg-hover' : 'opacity-40 cursor-not-allowed'}`} 
                                        onClick={() => hasNotes && setIncludeNotes(!includeNotes)}
                                    >
                                        <div className={includeNotes && hasNotes ? 'text-primary' : 'text-text-faint'}>
                                            {includeNotes && hasNotes ? <CheckSquare size={14} /> : <Square size={14} />}
                                        </div>
                                        <span className="text-xs font-medium text-text-main">Include Notes (Workflow instructions)</span>
                                    </div>
                                    <div 
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors duration-200 ${hasHistory ? 'cursor-pointer hover:bg-bg-hover' : 'opacity-40 cursor-not-allowed'}`} 
                                        onClick={() => hasHistory && setIncludeHistory(!includeHistory)}
                                    >
                                        <div className={includeHistory && hasHistory ? 'text-primary' : 'text-text-faint'}>
                                            {includeHistory && hasHistory ? <CheckSquare size={14} /> : <Square size={14} />}
                                        </div>
                                        <span className="text-xs font-medium text-text-main">Include Version History (Snapshots)</span>
                                    </div>
                                    <div 
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors duration-200 ${hasPresets ? 'cursor-pointer hover:bg-bg-hover' : 'opacity-40 cursor-not-allowed'}`} 
                                        onClick={() => hasPresets && setIncludePresets(!includePresets)}
                                    >
                                        <div className={includePresets && hasPresets ? 'text-primary' : 'text-text-faint'}>
                                            {includePresets && hasPresets ? <CheckSquare size={14} /> : <Square size={14} />}
                                        </div>
                                        <span className="text-xs font-medium text-text-main">Include Variable Presets</span>
                                    </div>
                                </div>

                            </motion.div>
                        ) : (
                            <motion.div key="success" className="py-8 flex flex-col items-center text-center space-y-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                                    <Check size={28} strokeWidth={3} />
                                </div>
                                <h3 className="text-lg font-bold text-text-main leading-none">Submission Received!</h3>
                                <p className="text-xs text-text-muted px-4 leading-relaxed max-w-[280px]">
                                    Your prompt has been successfully staged in `#prompt-submissions`. You can track the moderation status on the Discord server.
                                </p>
                                <button 
                                    onClick={() => { window.open(DISCORD_UPLOAD_WORKFLOW_INVITE, "_blank"); onClose(); }} 
                                    className="px-6 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl text-xs font-bold uppercase tracking-wider duration-200 active:brightness-90 cursor-pointer"
                                >
                                    Open Discord Submissions
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer */}
                {!publishSuccess && (
                    <div className="p-4 border-t border-border bg-bg-surface flex items-center justify-end shrink-0 gap-3">
                        <button onClick={onClose} disabled={isPublishing} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main transition-colors duration-200">
                            Cancel
                        </button>
                        <button 
                            onClick={handlePublish} 
                            disabled={isPublishing || !authorName.trim()}
                            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-primary/20 transition-all duration-200 active:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isPublishing ? 'Publishing...' : <><Send size={14} /> Publish to Community</>}
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
