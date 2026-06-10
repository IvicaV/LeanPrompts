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
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, AlertCircle, Check, CheckCircle2, ChevronDown, Star, Linkedin } from 'lucide-react';
import { enableDragSelectScroll } from '../utils/scrollHelper';

export default function FeedbackDrawer({ isOpen, onClose }) {
    const [type, setType] = useState('Question');
    const [message, setMessage] = useState('');
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle, sending, success, error
    const [honey, setHoney] = useState('');

    const [errors, setErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState('');
    const [showEmptyHint, setShowEmptyHint] = useState(false);
    const textareaRef = useRef(null);

    // Auto-focus textarea when drawer opens
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            // Small delay to ensure the animation doesn't interfere with focus
            const timer = setTimeout(() => {
                textareaRef.current.focus({ preventScroll: true });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Reset form state when drawer closes
    useEffect(() => {
        if (!isOpen) {
            // Delay reset slightly to allow exit animation to complete
            const timer = setTimeout(() => {
                setStatus('idle');
                setType('Question');
                setMessage('');
                setEmail('');
                setHoney('');
                setErrors({});
                setSuccessMessage('');
                setShowEmptyHint(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const placeholders = {
        'Question': "Got a question or stuck on something? Type it here and I'll jump in to help!",
        'Bug': "Oops, did something break? Tell me what happened so I can squish that bug for you!",
        'Feature': "Have a brilliant idea for a new feature? I'd love to hear how I can make LeanPrompts even more powerful for you!"
    };

    const validate = () => {
        const newErrors = {};
        if (!message.trim()) {
            newErrors.message = 'Please describe your request.';
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Please enter a valid email address.';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!message.trim()) {
            setShowEmptyHint(true);
            setTimeout(() => setShowEmptyHint(false), 3000);
            return;
        }

        if (!validate()) return;

        setStatus('sending');

        // Honeypot check
        if (honey) {
            setTimeout(() => {
                setSuccessMessage(email.trim()
                    ? "Your feedback has been received. I'll be in touch soon!"
                    : "Your feedback has been sent anonymously. I appreciate your input!");
                setStatus('success');
                setMessage('');
                setEmail('');
                setErrors({});
                setTimeout(onClose, 4000);
            }, 1000);
            return;
        }

        // Direct constant for bulletproof execution (Public Webhook)
        const ENDPOINT = "https://script.google.com/macros/s/AKfycbykF1Z-6vfnY9FRhfqnYzwQVZQcXwVMXDl9eVfCeQCe2ptP43w4BU_uHTrMBe8hQvt_/exec";

        const getTechnicalMetadata = () => {
            const ua = window.navigator.userAgent;
            const platform = window.navigator.platform;

            // OS Detection
            let os = platform;
            if (platform.startsWith('Win')) os = 'Windows';
            else if (platform.startsWith('Mac')) os = 'Mac OS';
            else if (platform.startsWith('Linux')) os = 'Linux';
            else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
            else if (/Android/.test(ua)) os = 'Android';

            // Browser Detection
            let browser = 'Unknown';
            if (ua.includes("Opera") || ua.includes("OPR/")) browser = 'Opera';
            else if (ua.includes("Edg/")) browser = 'Edge';
            else if (ua.includes("Chrome")) browser = 'Chrome';
            else if (ua.includes("Safari")) browser = 'Safari';
            else if (ua.includes("Firefox")) browser = 'Firefox';

            return { os, browser };
        };

        const { os, browser } = getTechnicalMetadata();

        const payload = {
            type,
            message: message.trim(), // Trim whitespace to prevent empty lines in Sheets
            email: email || 'Anonymous',
            version: chrome.runtime?.getManifest()?.version || '1.0.5',
            os,
            browser
        };

        try {
            // text/plain Bypass for CORS Preflight
            const response = await fetch(ENDPOINT, {
                method: "POST",
                redirect: "follow",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8",
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (data.status === 'success') {
                setSuccessMessage(email.trim()
                    ? "Your feedback has been received. I'll be in touch soon!"
                    : "Your feedback has been sent anonymously. I appreciate your input!");
                setStatus('success');
                setMessage('');
                setEmail('');
                setErrors({});
                setTimeout(() => {
                    // onClose(); // Removed auto-close to allow seeing support module
                    // setStatus('idle');
                    // setSuccessMessage('');
                }, 4000);
            } else {
                throw new Error(data.message || 'Error from server');
            }
        } catch (error) {
            console.error("Feedback error:", error);
            setStatus('error');
            // Extend timeout to 8 seconds so the user has time to click the GitHub fallback link
            setTimeout(() => setStatus('idle'), 8000);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99] transition-opacity duration-300"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh] md:pt-[12vh] pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="modal-glass-panel w-full max-w-[440px] pointer-events-auto rounded-[28px] p-6 overflow-hidden max-h-[95vh] relative"
                        >
                            {/* Top Decorative Handle */}
                            <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-6 opacity-50" />

                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center text-primary">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-text-main leading-none">Feedback & Support</h3>
                                        <p className="text-xs text-zinc-500 mt-1">I'd love to hear from you!</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="relative min-h-[320px] flex flex-col justify-center">
                                <AnimatePresence mode="wait">
                                    {status !== 'success' ? (
                                        <motion.form
                                            key="form"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            onSubmit={handleSubmit}
                                            noValidate
                                            className="space-y-4"
                                        >
                                            {/* Honeypot */}
                                            <input
                                                type="text"
                                                value={honey}
                                                onChange={(e) => setHoney(e.target.value)}
                                                style={{ display: 'none' }}
                                                tabIndex="-1"
                                                autoComplete="off"
                                            />

                                            <div className="grid grid-cols-3 gap-2">
                                                {['Question', 'Bug', 'Feature'].map((t) => (
                                                    <button
                                                        key={t}
                                                        type="button"
                                                        onClick={() => setType(t)}
                                                        className={`py-2 px-1 rounded-xl text-xs font-semibold border-2 transition-all ${type === t
                                                            ? 'border-primary bg-primary/5 text-primary'
                                                            : 'border-transparent bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                                                            }`}
                                                    >
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="space-y-1">
                                                <textarea
                                                    ref={(el) => {
                                                        textareaRef.current = el;
                                                        if (el) enableDragSelectScroll(el);
                                                    }}
                                                    rows="4"
                                                    placeholder={placeholders[type]}
                                                    value={message}
                                                    onChange={(e) => {
                                                        setMessage(e.target.value);
                                                        if (errors.message) setErrors(prev => ({ ...prev, message: null }));
                                                        if (showEmptyHint) setShowEmptyHint(false);
                                                    }}
                                                    className={`w-full p-4 rounded-xl dark:bg-zinc-800 bg-zinc-100 border border-transparent focus:border-primary transition-all outline-none resize-none text-text-main text-sm`}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <input
                                                    type="email"
                                                    placeholder="Email (Optional)"
                                                    value={email}
                                                    onChange={(e) => {
                                                        setEmail(e.target.value);
                                                        if (errors.email) setErrors(prev => ({ ...prev, email: null }));
                                                    }}
                                                    className={`w-full p-4 rounded-xl dark:bg-zinc-800 bg-zinc-100 border transition-all outline-none ${errors.email ? 'border-amber-500' : 'border-transparent focus:border-primary'
                                                        } text-text-main text-sm`}
                                                />
                                                {errors.email && (
                                                    <div className="flex items-center justify-center gap-1.5 px-2 py-1 text-amber-500">
                                                        <AlertCircle size={12} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">{errors.email}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="relative">
                                                <AnimatePresence>
                                                    {showEmptyHint && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 4 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 4 }}
                                                            className="flex items-center justify-center gap-1.5 px-2 py-1 text-amber-500 mb-1"
                                                        >
                                                            <AlertCircle size={12} />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">Please enter a message</span>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                                <button
                                                    type="submit"
                                                    disabled={status === 'sending'}
                                                    className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${status === 'error'
                                                        ? 'bg-amber-500 text-white'
                                                        : 'bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/25'
                                                        } disabled:opacity-50`}
                                                >
                                                    {status === 'sending' ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                            Sending...
                                                        </>
                                                    ) : status === 'error' ? (
                                                        <>
                                                            <AlertCircle size={18} />
                                                            Error. Try again.
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Send size={18} />
                                                            Send Message
                                                        </>
                                                    )}
                                                </button>
                                                {/* Privacy Policy & Fallback */}
                                                {status === 'error' ? (
                                                    <p className="text-center text-[11px] text-amber-500 dark:text-amber-400 mt-3 animate-fade-in font-medium">
                                                        Server busy. Please report this via <a href="https://github.com/IvicaV/LeanPrompts/issues" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-primary transition-colors">GitHub Issues</a>.
                                                    </p>
                                                ) : (
                                                    <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-500 mt-3">
                                                        Your data privacy matters.{' '}
                                                        <a
                                                            href="https://github.com/IvicaV/LeanPrompts/blob/main/PRIVACY.md"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="underline hover:text-primary transition-colors"
                                                        >
                                                            Privacy Policy
                                                        </a>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Minimalist Support Entry (Form Bottom) */}
                                            {type !== 'Bug' && (
                                                <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800/50 opacity-40 hover:opacity-100 transition-opacity">
                                                    <SupportModule variant="mini" />
                                                </div>
                                            )}
                                        </motion.form>
                                    ) : (
                                        <motion.div
                                            key="success"
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className="py-8 flex flex-col items-center text-center"
                                        >
                                            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-6">
                                                <CheckCircle2 size={32} strokeWidth={3} />
                                            </div>
                                            <h3 className="text-xl font-bold text-text-main mb-2">
                                                Thank You!
                                            </h3>
                                            <p className="text-sm text-zinc-500 px-4 leading-relaxed max-w-[280px]">
                                                {successMessage}
                                            </p>

                                            {/* Premium Support Module (Success State) */}
                                            {type !== 'Bug' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 30 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.3, duration: 0.5 }}
                                                    className="mt-8 w-full border-t border-zinc-100 dark:border-zinc-800 pt-8"
                                                >
                                                    <SupportModule variant="full" />
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>


                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}

/**
 * Support & Growth Module (Shared Component)
 */
function SupportModule({ variant = 'full' }) {
    const isMini = variant === 'mini';

    const shareTextLinkedIn = `If you use AI tools like ChatGPT or Claude every day, you know the "copy-paste shuffle." You find a prompt in your notes, copy it, paste it, then manually fill in the blanks, and - the worst part - drag in the same reference files for the 10th time today.

I just found a tool that finally ends this: LeanPrompts Studio.

It’s a browser extension that acts like a professional dashboard for your prompts. Instead of copying and pasting, you just click a button, and it "beams" your text and files directly into the chat for you.

It's built by a solo developer, it’s completely local (everything stays on your computer), there’s no account needed, and it’s totally free.

You can find it on the Chrome Web Store or Opera. Check the project here for the links:  
https://github.com/IvicaV/LeanPrompts`;

    const shareTextX = `One of those tools you should actually be paying a subscription for.
LeanPrompts, a local prompt IDE for your browser. Manage prompts, build chains, and inject directly into the LLM.
All free. All local. All Open Source.
https://github.com/IvicaV/LeanPrompts`;

    const shareX = () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTextX)}`, '_blank');
    };

    const shareLinkedIn = () => {
        // Set flag for content script to show notification on LinkedIn page
        if (chrome.storage?.local) {
            chrome.storage.local.set({ lp_linkedin_pending_share: true }, () => {
                window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareTextLinkedIn)}`, '_blank');
            });
        } else {
            window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareTextLinkedIn)}`, '_blank');
        }
    };

    const rateWebstore = () => {
        const ua = window.navigator.userAgent;
        const isOpera = ua.includes("Opera") || ua.includes("OPR/");

        // Direct Chrome Web Store link and Opera fallback
        const CHROME_URL = 'https://chromewebstore.google.com/detail/leanprompts-studio/pbdbopolbilaemiphldmecmlppedajnd';
        const OPERA_URL = 'https://addons.opera.com/search/?query=LeanPrompts';

        window.open(isOpera ? OPERA_URL : CHROME_URL, '_blank');
    };

    return (
        <div className="flex flex-col gap-5">
            {/* Rating Section */}
            <div className="flex flex-col gap-2">
                {!isMini && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 text-center">
                        Love LeanPrompts?
                    </span>
                )}
                <button
                    onClick={rateWebstore}
                    className={`w-full flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98] ${isMini
                        ? 'py-2 px-3 text-[11px] bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 hover:text-primary'
                        : 'py-3.5 px-4 rounded-xl text-xs bg-primary-subtle text-primary border border-primary/20 hover:bg-primary/20 shadow-sm'
                        }`}
                >
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={isMini ? 10 : 12} fill="currentColor" strokeWidth={0} />)}
                    </div>
                    <span>{isMini ? "Rate on Web Store" : "Support a Solo-Dev: Rate on Web Store"}</span>
                </button>
            </div>

            {/* Social Share Section */}
            <div className="flex flex-col gap-3">
                {!isMini && (
                    <div className="text-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            Help me spread the word
                        </span>
                        <p className="text-[11px] text-zinc-500 mt-1 leading-tight">
                            Your support means everything. Share it with your network!
                        </p>
                    </div>
                )}

                <div className={`flex gap-3 ${isMini ? 'justify-center' : 'justify-center'}`}>
                    <ShareButton
                        icon={
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5 fill-current">
                                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932L18.901 1.153zM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644z" />
                            </svg>
                        }
                        label="Share on X"
                        onClick={shareX}
                        isMini={isMini}
                    />
                    <ShareButton
                        icon={<Linkedin size={14} />}
                        label="Share on LinkedIn"
                        onClick={shareLinkedIn}
                        isMini={isMini}
                    />
                </div>
            </div>
        </div>
    );
}

function ShareButton({ icon, label, onClick, isMini }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.98] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl hover:border-primary hover:bg-primary/5 hover:text-primary dark:hover:border-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-primary ${isMini
                ? 'p-2 text-zinc-400'
                : 'py-2.5 px-4 text-[11px] text-zinc-500 shadow-sm'
                }`}
            title={label}
        >
            {icon}
            {!isMini && <span>{label}</span>}
        </button>
    );
}
