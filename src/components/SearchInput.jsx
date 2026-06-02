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
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const SearchInput = React.forwardRef(({ value, onChange, onClear, placeholder, className, ...props }, ref) => {
  return (
    <div className="relative group w-full">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint group-focus-within:text-primary transition-colors duration-200" />
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder || "Search..."}
        className={twMerge(clsx(
          "w-full bg-bg-secondary border border-border rounded-xl pl-9 pr-8 py-1.5 text-xs text-text-main",
          "focus:outline-none focus:ring-0 focus:border-primary",
          "placeholder:text-text-muted transition-colors duration-200 shadow-sm",
          className
        ))}
        {...props}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded-full hover:bg-bg-hover transition-colors duration-200"
          title="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
});
SearchInput.displayName = 'SearchInput';
export default SearchInput;
