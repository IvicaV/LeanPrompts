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
/**
 * Searches for patterns like {{Topic}}.
 * Now natively supports this variant for variable extraction.
 */
export const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Strips supported comment formats from the text.
 * - HTML/XML comments: <!-- comment -->
 * - Block comments: /* comment *\/
 * - Line comments: // comment (protected against URLs like http:// by ensuring no preceding colon)
 */
export const getIgnoredRanges = (text) => {
  if (!text) return [];
  const ranges = [];
  let i = 0;
  const len = text.length;

  // ZERO-REGRESSION: Pre-calculate image ranges to fast-forward past them.
  // Prevents random '/*' inside Base64 or '//' inside http/https URLs from corrupting the parser.
  const imageRanges = [];
  const imgRegex = /!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)]+)\)/g;
  let m;
  while ((m = imgRegex.exec(text)) !== null) {
      imageRanges.push({ from: m.index, to: m.index + m[0].length });
  }
  let currentImageIdx = 0;

  let inBlockComment = false;
  let inObsidianComment = false;
  let inHtmlComment = false;
  let inInlineCode = false;
  let inLineComment = false;
  let inFencedBlock = false;
  let startIdx = -1;

  while (i < len) {
    // FAST-FORWARD: Skip entirely over Base64 markdown images
    if (currentImageIdx < imageRanges.length && i >= imageRanges[currentImageIdx].from) {
        if (i < imageRanges[currentImageIdx].to) {
            i = imageRanges[currentImageIdx].to;
            continue;
        } else {
            currentImageIdx++;
        }
    }

    if (text.slice(i, i + 3) === '```') {
      inFencedBlock = !inFencedBlock;
      i += 3;
      continue;
    }

    if (inFencedBlock) {
      i++;
      continue;
    }

    if (inInlineCode) {
      if (text[i] === '`') {
        ranges.push({ from: startIdx, to: i + 1 });
        inInlineCode = false;
      } else if (text[i] === '\n') {
        ranges.push({ from: startIdx, to: i });
        inInlineCode = false;
      }
      i++;
      continue;
    }

    if (inLineComment) {
      if (text[i] === '\n') {
        ranges.push({ from: startIdx, to: i });
        inLineComment = false;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (text.slice(i, i + 2) === '*/') {
        ranges.push({ from: startIdx, to: i + 2 });
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inObsidianComment) {
      if (text.slice(i, i + 2) === '%%') {
        ranges.push({ from: startIdx, to: i + 2 });
        inObsidianComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inHtmlComment) {
      if (text.slice(i, i + 3) === '-->') {
        ranges.push({ from: startIdx, to: i + 3 });
        inHtmlComment = false;
        i += 3;
      } else {
        i++;
      }
      continue;
    }

    // Checking for starts
    if (text[i] === '`') {
      inInlineCode = true;
      startIdx = i;
      i++;
      continue;
    }

    if (text.slice(i, i + 2) === '%%') {
      let isStartOfLine = true;
      let j = i - 1;
      while (j >= 0) {
        if (text[j] === '\n') break;
        if (text[j] !== ' ' && text[j] !== '\t') {
          isStartOfLine = false;
          break;
        }
        j--;
      }
      if (isStartOfLine) {
        inObsidianComment = true;
        startIdx = i;
        i += 2;
        continue;
      }
    }

    if (text.slice(i, i + 2) === '/*') {
      inBlockComment = true;
      startIdx = i;
      i += 2;
      continue;
    }

    if (text.slice(i, i + 4) === '<!--') {
      inHtmlComment = true;
      startIdx = i;
      i += 4;
      continue;
    }

    if (text.slice(i, i + 2) === '//') {
       let j = i - 1;
       let spaceCount = 0;
       let isStartOfLine = false;
       while (j >= 0) {
         if (text[j] === '\n') { isStartOfLine = true; break; }
         else if (text[j] === ' ') { spaceCount++; }
         else if (text[j] === '\t') { spaceCount += 2; }
         else { break; }
         j--;
       }
       if (j < 0) isStartOfLine = true;

       if ((isStartOfLine || spaceCount >= 2 || (i > 0 && text[i-1] === '\t')) && (i === 0 || text[i-1] !== ':')) {
         inLineComment = true;
         startIdx = i;
         i += 2;
         continue;
       }
    }

    i++;
  }

  if (inInlineCode || inLineComment || inBlockComment || inObsidianComment || inHtmlComment) {
    ranges.push({ from: startIdx, to: len });
  }

  return ranges;
};

export const stripComments = (text) => {
  if (!text) return text;

  // Vorberechnung der Bild-Bereiche zur Absicherung von Base64 & Web-Bildelementen
  const imageRanges = [];
  const imgRegex = /!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)]+)\)/g;
  let m;
  while ((m = imgRegex.exec(text)) !== null) {
      imageRanges.push({ from: m.index, to: m.index + m[0].length });
  }
  let currentImageIdx = 0;

  let result = '';
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inObsidianComment = false;
  let inHtmlComment = false;
  let inInlineCode = false; 
  let inFencedBlock = false;

  const len = text.length;
  while (i < len) {
    if (currentImageIdx < imageRanges.length && i >= imageRanges[currentImageIdx].from) {
        if (i < imageRanges[currentImageIdx].to) {
            result += text.slice(imageRanges[currentImageIdx].from, imageRanges[currentImageIdx].to);
            i = imageRanges[currentImageIdx].to;
            continue;
        } else {
            currentImageIdx++;
        }
    }

    // startsWith(searchString, position) alloziiert keinen Speicher auf dem Heap
    if (text.startsWith('```', i)) {
      inFencedBlock = !inFencedBlock;
      result += '```';
      i += 3;
      continue;
    }

    if (inFencedBlock) {
      result += text[i];
      i++;
      continue;
    }

    if (inInlineCode) {
      if (!inLineComment && !inBlockComment && !inObsidianComment && !inHtmlComment) {
        result += text[i];
      }
      if (text[i] === '`') {
        inInlineCode = false;
      } else if (text[i] === '\n') {
        inInlineCode = false; 
      }
      i++;
      continue;
    }

    if (text[i] === '`') {
      inInlineCode = true;
      if (!inLineComment && !inBlockComment && !inObsidianComment && !inHtmlComment) {
        result += text[i];
      }
      i++;
      continue;
    }

    if (inLineComment) {
      if (text[i] === '\n') {
        inLineComment = false;
        result += text[i];
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (text.startsWith('*/', i)) {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inObsidianComment) {
      if (text.startsWith('%%', i)) {
        inObsidianComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inHtmlComment) {
      if (text.startsWith('-->', i)) {
        inHtmlComment = false;
        i += 3;
      } else {
        i++;
      }
      continue;
    }

    if (text.startsWith('%%', i)) {
      let isStartOfLine = true;
      let j = i - 1;
      while (j >= 0) {
        if (text[j] === '\n') break;
        if (text[j] !== ' ' && text[j] !== '\t') {
          isStartOfLine = false;
          break;
        }
        j--;
      }
      if (isStartOfLine) {
        inObsidianComment = true;
        i += 2;
        continue;
      }
    }

    if (text.startsWith('/*', i)) {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (text.startsWith('<!--', i)) {
      inHtmlComment = true;
      i += 4;
      continue;
    }

    if (text.startsWith('//', i)) {
      let j = i - 1;
      let spaceCount = 0;
      let isStartOfLine = false;
      while (j >= 0) {
        if (text[j] === '\n') {
          isStartOfLine = true;
          break;
        } else if (text[j] === ' ') {
          spaceCount++;
        } else if (text[j] === '\t') {
          spaceCount += 2;
        } else {
          break;
        }
        j--;
      }
      if (j < 0) isStartOfLine = true;

      if (isStartOfLine || spaceCount >= 2 || text[i-1] === '\t') {
        if (i === 0 || text[i-1] !== ':') {
           inLineComment = true;
           i += 2;
           continue;
        }
      }
    }

    result += text[i];
    i++;
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
};

export const parseVariables = (text) => {
  if (!text) return [];

  // Remove any comments before parsing variables!
  text = stripComments(text);
  const ignored = getIgnoredRanges(text);
  const isIgnored = (pos) => ignored.some(r => pos >= r.from && pos <= r.to);

  // Regex matches ONLY {{Variable}}
  // Support for [[...]] has been removed per user request.
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = [...text.matchAll(regex)];

  const uniqueVars = new Set();

  matches.forEach(match => {
    if (isIgnored(match.index)) return;

    // Extract content from {{...}} (Group 1)
    let raw = (match[1] || "").trim();

    // If a default value is used ({{Var:Default}}), we split at the colon
    const parts = raw.split(':');

    // NEU: Erkennen, ob es eine Datei ist (mit oder ohne ! Prefix)
    const firstPart = parts[0].trim().toLowerCase();
    if ((firstPart === 'file' || firstPart === '!file') && parts.length > 1) {
      const prefix = firstPart === '!file' ? '!file:' : 'file:';
      uniqueVars.add(`${prefix}${parts[1].trim()}`);
    } else {
      const key = parts[0].trim();
      // ZERO-REGRESSION GUARD: System-Makros ($) aus dem UI-Inspector ausschließen
      if (key && !key.startsWith('$')) uniqueVars.add(key);
    }
  });

  // --- ZERO-REGRESSION: UX SORTING (Files/Dropzones immer zuerst) ---
  // Sortiert das Array global für alle UI-Komponenten, ohne die chronologische 
  // Reihenfolge der restlichen Text-Variablen anzutasten.
  return Array.from(uniqueVars).sort((a, b) => {
    const aIsFile = a.toLowerCase().startsWith('file:') || a.toLowerCase().startsWith('!file:');
    const bIsFile = b.toLowerCase().startsWith('file:') || b.toLowerCase().startsWith('!file:');
    
    if (aIsFile && !bIsFile) return -1; // Datei rutscht nach oben
    if (!aIsFile && bIsFile) return 1;  // Datei rutscht nach oben
    return 0; // Text-Variablen behalten ihre chronologische Reihenfolge
  });
  // ------------------------------------------------------------------
};

/**
 * Resolves snippets (@Name or @{Name}) with recursion protection.
 */
export const resolveSnippets = (text, allSnippets, depth = 0) => {
  if (!text || !allSnippets) return text || "";
  if (depth > 10) {
    throw new Error("RECURSION_LIMIT");
  }

  const ignored = getIgnoredRanges(text);
  const isIgnored = (pos) => ignored.some(r => pos >= r.from && pos <= r.to);

  // Regex: Matches @Name OR @{Name} (Lookbehind schützt E-Mail-Adressen, kein gieriges Punkt-Matching)
  return text.replace(/(?<![a-zA-Z0-9_.+\-])@(?:\{([^{}]+)\}|([\w-]+(?:\.[\w-]+)*))/g, (match, nameInBrackets, nameSimple, offset) => {
    if (isIgnored(offset)) return match;
    const cleanName = (nameInBrackets || nameSimple || "").trim();

    const snippet = allSnippets.find(s => s.name === cleanName);

    if (snippet) {
      return resolveSnippets(snippet.content, allSnippets, depth + 1);
    }
    // If snippet not found: leave original
    return match;
  });
};

/**
 * Replaces variables in text with values.
 * Supports ONLY {{Variable}}.
 * Considers ignoredVariables for the Markdown Exclude mechanism.
 */
export const compilePrompt = (text, values, ignoredVariables = []) => {
  if (!text) return "";

  // Remove any comments before substituting variables and sending to LLM!
  text = stripComments(text);
  const ignored = getIgnoredRanges(text);
  const isIgnored = (pos) => ignored.some(r => pos >= r.from && pos <= r.to);

  // Regex matches ONLY {{...}}
  const regex = /\{\{([^}]+)\}\}/g;

  return text.replace(regex, (match, contentCurly, offset) => {
    if (isIgnored(offset)) return match;
    // Determine variable name
    const rawContent = (contentCurly || "").trim();
    const parts = rawContent.split(':');

    let key;
    let isFile = false;
    let defaultValue = "";

    const firstPart = parts[0].trim().toLowerCase();
    if ((firstPart === 'file' || firstPart === '!file') && parts.length > 1) {
      const prefix = firstPart === '!file' ? '!file:' : 'file:';
      key = `${prefix}${parts[1].trim()}`;
      isFile = true;
    } else {
      key = parts[0].trim();
      // Optional default value after colon
      defaultValue = parts.length > 1 ? parts.slice(1).join(':').trim() : "";
    }

    // 1. CHECK: Should this variable be ignored (Markdown Exclude)?
    if (ignoredVariables.includes(key)) {
      return match;
    }

    // --- ZERO-REGRESSION: SYNCHRONOUS SYSTEM MACROS INTERCEPTOR ---
    if (key.startsWith('$')) {
      const now = new Date();
      switch (key.toLowerCase()) {
        case '$date': return now.toLocaleDateString();
        case '$time': return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case '$day': return now.toLocaleDateString(undefined, { weekday: 'long' });
        case '$uuid': return crypto.randomUUID();
        case '$language': return typeof navigator !== 'undefined' ? (navigator.language || 'en-US') : 'en-US';
        default: return match; // Fallback, falls der User etwas Unbekanntes tippt
      }
    }
    // --- ENDE INTERCEPTOR ---

    // 2. REGULAR REPLACEMENT
    // ZERO-REGRESSION FIX: Lese immer unter dem sauberen Key (ohne !)
    const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
    const userValue = values[cleanKey] !== undefined ? values[cleanKey] : values[key];

    // If it's a file variable and we have file(s), extract the names
    if (isFile && userValue) {
      if (Array.isArray(userValue)) {
        return userValue.map(file => file.name).join(', ');
      } else if (userValue.name) {
        return userValue.name;
      }
    }

    // If a value exists (even if it's "0"), we use it
    if (userValue !== undefined && userValue !== "") {
      return userValue;
    }

    // Fallback to default value if defined in template
    if (defaultValue) {
      // SAFE GUARD: Wenn es ein Dropdown-Enum ist (z.B. Option A | Option B), nimm immer die erste Option als Fallback
      if (defaultValue.includes('|')) {
        return defaultValue.split('|')[0].trim();
      }
      return defaultValue;
    }

    // Leave placeholder in text if no value and no default present
    return match;
  });
};