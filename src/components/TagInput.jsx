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
import React, { useState } from 'react';
import { X, Tag } from 'lucide-react';

export default function TagInput({ tags = [], onChange, availableTags = [], placeholder = "Type to add tag...", icon = null }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    const lowerInput = input.toLowerCase();
    const filtered = availableTags
      .filter(t => typeof t === 'string' && t.toLowerCase().includes(lowerInput) && !tags.includes(t))
      .slice(0, 5); // Limit to 5 suggestions
    setSuggestions(filtered);
    setSelectedIndex(-1); // Reset selection on input change
  }, [input, availableTags, tags]);

  const addTag = (val) => {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInput('');
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      // If a suggestion is selected, add it.
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        addTag(suggestions[selectedIndex]);
      } else {
        // Otherwise, just add whatever is in the input
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : prev));
    } else if (e.key === 'Escape') {
      setSuggestions([]);
    }
  };

  const removeTag = (tagToRemove) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  // Click outside to close suggestions
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative group">
      <div className="flex flex-wrap items-center gap-2 p-2 bg-bg-surface border border-border rounded-lg focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/5 transition-all min-h-[42px] max-h-[70px] overflow-y-auto custom-scrollbar shadow-sm">
        {icon ?? <Tag size={14} className="text-text-muted ml-1" />}

        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center leading-none gap-1 px-1.5 h-[22px] bg-zinc-100 dark:bg-bg-elevated text-text-main text-xs font-medium rounded-sm animate-fade-in group/tag"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-red-500 rounded p-0.5 transition-colors opacity-50 group-hover/tag:opacity-100"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          onBlur={() => addTag(input)}
          autoFocus={true} // Add autofocus to help user finding it
          className="flex-1 bg-transparent text-xs text-text-main focus:outline-none min-w-[120px] placeholder:text-text-muted/50 ml-1 h-[22px]"
        />
      </div>

      {/* AUTOCOMPLETE DROPDOWN */}
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-bg-surface border border-border rounded-md shadow-xl z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 dm-dropdown">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              onClick={() => addTag(suggestion)}
              onMouseDown={(e) => e.preventDefault()} // Prevent blur on input
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${index === selectedIndex
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-main hover:bg-bg-elevated'
                }`}
            >
              <span>{suggestion}</span>
              {index === selectedIndex && <span className="text-[10px] text-text-muted">Enter</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}