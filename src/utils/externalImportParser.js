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

export const IMPORT_STRATEGIES = {
  SINGLE_PER_FILE: 'single',
  HORIZONTAL_RULE: 'delimiter_hr',
  HEADINGS_H1: 'headings_h1',
  CUSTOM_DELIMITER: 'custom',
  MANUAL_SELECTION: 'manual_selection'
};

/**
 * Strips UTF-8 BOM and normalizes CRLF / CR line endings to LF.
 */
export function normalizeText(rawText) {
  if (typeof rawText !== 'string') return '';
  return rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Fast, deterministic FNV-1a 32-bit hash for duplicate content detection.
 * Normalizes whitespace/newlines before hashing so minor CRLF differences match.
 */
export function computeContentHash(text) {
  const normalized = normalizeText(text).trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + '_' + normalized.length;
}

/**
 * Cleans filenames from external exports (especially Notion 32-hex IDs and extensions).
 * Example: "Cold Email Outreach 3fa8bc91e7044a8fb912a1b2c3d4e5f6.md" -> "Cold Email Outreach"
 */
export function cleanExternalFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'Untitled Prompt';
  // Extract basename if path is passed
  const base = filename.split(/[/\\]/).pop() || filename;
  // Strip known extensions
  let name = base.replace(/\.(md|markdown|txt|csv)$/i, '').trim();
  // Strip Notion 32-character hex UUID suffix (preceded by space or underscore/hyphen)
  name = name.replace(/[\s_-]+[a-f0-9]{32}$/i, '').trim();
  // Replace underscores with spaces if there are no spaces at all
  if (!name.includes(' ') && name.includes('_')) {
    name = name.replace(/_/g, ' ').trim();
  }
  return name || 'Untitled Prompt';
}

/**
 * Extracts folder name from a relative path (e.g. from webkitRelativePath or drag-drop entry).
 * Returns null if the file is at the root level or only inside a generic root export folder.
 */
export function extractFolderCollectionName(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  // If path is just "file.md", no folder
  if (parts.length <= 1) return null;
  // Take the immediate parent folder of the file
  const parentFolder = parts[parts.length - 2];
  // Clean Notion hash from folder name if present
  const cleaned = cleanExternalFilename(parentFolder);
  if (!cleaned || /^(export|markdown|prompts|vault|untitled prompt)$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Extracts YAML Frontmatter from the top of a Markdown document BEFORE segmentation.
 * Prevents `---` frontmatter boundaries from being mistaken for horizontal rule delimiters.
 */
export function extractFrontmatter(text) {
  const normalized = normalizeText(text);
  if (!normalized.startsWith('---\n')) {
    return { body: normalized, frontmatter: { title: null, tags: [] } };
  }

  // Look for closing --- on its own line within the first 60 lines
  const lines = normalized.split('\n');
  let closingIdx = -1;
  const maxScan = Math.min(lines.length, 60);
  for (let i = 1; i < maxScan; i++) {
    if (/^---\s*$/.test(lines[i])) {
      closingIdx = i;
      break;
    }
  }

  if (closingIdx === -1) {
    return { body: normalized, frontmatter: { title: null, tags: [] } };
  }

  const yamlLines = lines.slice(1, closingIdx);
  // Join remaining lines as body
  const body = lines.slice(closingIdx + 1).join('\n').replace(/^\n+/, '');

  let title = null;
  const tags = [];
  let inTagsList = false;

  for (const rawLine of yamlLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Check if we are reading a multi-line YAML array under `tags:`
    if (inTagsList) {
      if (line.startsWith('- ')) {
        const tagVal = line.slice(2).trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
        if (tagVal) tags.push(tagVal);
        continue;
      } else if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
        inTagsList = false;
      }
    }

    const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }

    const tagsMatch = line.match(/^tags?\s*:\s*(.*)$/i);
    if (tagsMatch) {
      const rest = tagsMatch[1].trim();
      if (!rest) {
        inTagsList = true;
      } else if (rest.startsWith('[') && rest.endsWith(']')) {
        const inner = rest.slice(1, -1);
        inner.split(',').forEach(t => {
          const clean = t.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
          if (clean) tags.push(clean);
        });
      } else {
        // Space or comma separated inline tags
        rest.split(/[, ]+/).forEach(t => {
          const clean = t.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
          if (clean) tags.push(clean);
        });
      }
    }
  }

  return {
    body,
    frontmatter: {
      title: title || null,
      tags: Array.from(new Set(tags))
    }
  };
}

/**
 * Fence-Aware State Machine Segmentation.
 * Splits a markdown/text body according to the chosen strategy while strictly
 * protecting fenced code blocks (``` or ~~~) from ever being split inside.
 */
export function segmentMarkdownContent(bodyText, strategy = IMPORT_STRATEGIES.SINGLE_PER_FILE, customDelimiter = '') {
  const normalized = normalizeText(bodyText);
  if (!normalized.trim()) return [];

  if (strategy === IMPORT_STRATEGIES.SINGLE_PER_FILE || strategy === IMPORT_STRATEGIES.MANUAL_SELECTION) {
    return [normalized.trim()];
  }

  const lines = normalized.split('\n');
  const chunks = [];
  let currentLines = [];
  let inFence = false;
  let fenceMarker = ''; // '```' or '~~~'

  const trimmedCustom = (customDelimiter || '').trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 1. Track Fenced Code Blocks (``` or ~~~)
    const fenceMatch = trimmedLine.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const markerType = fenceMatch[1][0]; // '`' or '~'
      if (!inFence) {
        inFence = true;
        fenceMarker = markerType;
      } else if (fenceMarker === markerType) {
        inFence = false;
        fenceMarker = '';
      }
      currentLines.push(line);
      continue;
    }

    // 2. If inside a code fence, NEVER split on any delimiter
    if (inFence) {
      currentLines.push(line);
      continue;
    }

    // 3. Evaluate delimiter outside of code fences
    if (strategy === IMPORT_STRATEGIES.HORIZONTAL_RULE) {
      // Matches standard Markdown horizontal rules: ---, ___, *** (3 or more chars, alone on line)
      if (/^(?:-{3,}|_{3,}|\*{3,})\s*$/.test(trimmedLine)) {
        const candidate = currentLines.join('\n').trim();
        if (candidate) chunks.push(candidate);
        currentLines = [];
        continue;
      }
    } else if (strategy === IMPORT_STRATEGIES.HEADINGS_H1) {
      // Matches top-level H1 heading: "# Title" (not "##")
      if (/^#\s+\S+/.test(trimmedLine)) {
        const candidate = currentLines.join('\n').trim();
        if (candidate) chunks.push(candidate);
        currentLines = [line]; // Keep the H1 line at the start of the new chunk so title extraction can use it
        continue;
      }
    } else if (strategy === IMPORT_STRATEGIES.CUSTOM_DELIMITER && trimmedCustom) {
      if (trimmedLine === trimmedCustom || line.startsWith(trimmedCustom)) {
        const candidate = currentLines.join('\n').trim();
        if (candidate) chunks.push(candidate);
        // If the line has text after the custom delimiter (e.g., "PROMPT: Cold Email"), keep the remainder
        const remainder = line.slice(line.indexOf(trimmedCustom) + trimmedCustom.length).replace(/^[:\s-]+/, '').trim();
        currentLines = remainder ? [`# ${remainder}`] : [];
        continue;
      }
    }

    currentLines.push(line);
  }

  const lastCandidate = currentLines.join('\n').trim();
  if (lastCandidate) {
    chunks.push(lastCandidate);
  }

  return chunks;
}

/**
 * Derives a clean title and body from a single segmented chunk.
 * Note: We keep the full chunk content intact (lossless) or optionally strip a redundant leading H1 if it matches.
 */
export function deriveChunkMetadata(chunkText, fallbackTitle, index = 0, totalInFile = 1) {
  const lines = normalizeText(chunkText).trim().split('\n');
  let detectedTitle = null;

  // Find the first non-empty line
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // If first non-empty line is a Markdown heading (#, ##, ###)
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      detectedTitle = headingMatch[1].trim().replace(/\s*#+\s*$/, '');
      break;
    }

    // If we split multiple prompts from a single file and there's no heading,
    // use a short first line (< 75 chars, no code fence) as title
    if (totalInFile > 1 && line.length <= 75 && !line.startsWith('```') && !line.startsWith('{')) {
      detectedTitle = line.replace(/^[*_>-]+\s*/, '').replace(/[*_:]+$/, '').trim();
      break;
    }
    break;
  }

  let finalTitle = detectedTitle;
  if (!finalTitle) {
    finalTitle = totalInFile > 1
      ? `${fallbackTitle || 'Imported Prompt'} (${index + 1})`
      : (fallbackTitle || `Imported Prompt ${index + 1}`);
  }

  // Cap overly long titles safely
  if (finalTitle.length > 90) {
    finalTitle = finalTitle.slice(0, 87).trim() + '...';
  }

  return {
    title: finalTitle,
    content: chunkText.trim()
  };
}

/**
 * Counts potential variables ({{var}}, [var], {var}) outside of code blocks for preview info only.
 * Does NOT mutate the text.
 */
export function countPotentialVariables(text) {
  if (!text) return 0;
  // Strip fenced code blocks before counting
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const matches = new Set();
  const regex = /\{\{([^{}\n]{1,50})\}\}|\[([^[\]\n]{2,40})\]|\{([a-zA-Z0-9_ -]{2,40})\}/g;
  let m;
  while ((m = regex.exec(withoutFences)) !== null) {
    const val = (m[1] || m[2] || m[3] || '').trim();
    if (val && !val.includes('http') && !/^\d+$/.test(val)) {
      matches.add(val);
    }
  }
  return matches.size;
}

/**
 * RFC-4180 compliant CSV parser that safely handles multiline quoted strings,
 * escaped double quotes (""), and auto-detects comma vs semicolon delimiters.
 */
export function parseCSVText(rawCsvText) {
  const text = normalizeText(rawCsvText).trim();
  if (!text) return { headers: [], rows: [] };

  // Auto-detect delimiter (comma vs semicolon vs tab) from the first line
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++; // Skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  // Push last cell/row
  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell !== '')) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((h, idx) => h.replace(/^\uFEFF/, '').trim() || `Column ${idx + 1}`);
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/**
 * Auto-guesses the best column indices for Title, Content, Tags, and Collection from CSV headers.
 */
export function guessCSVColumnMapping(headers) {
  const lower = headers.map(h => h.toLowerCase().trim());

  let titleIdx = lower.findIndex(h => /^(title|name|prompt name|prompt title|heading|titel|bezeichnung|subject)$/i.test(h));
  if (titleIdx === -1) titleIdx = lower.findIndex(h => h.includes('title') || h.includes('name'));

  let contentIdx = lower.findIndex(h => /^(prompt|content|text|body|template|instruction|instructions|system prompt|inhalt)$/i.test(h));
  if (contentIdx === -1) contentIdx = lower.findIndex(h => h.includes('prompt') || h.includes('content') || h.includes('text') || h.includes('body'));

  const tagsIdx = lower.findIndex(h => h.includes('tag') || h.includes('label') || h.includes('keywords'));
  const collectionIdx = lower.findIndex(h => h.includes('collection') || h.includes('category') || h.includes('folder') || h.includes('kategorie') || h.includes('group'));

  // Fallbacks if headers are generic
  if (titleIdx === -1 && headers.length >= 1) titleIdx = 0;
  if (contentIdx === -1 && headers.length >= 2) contentIdx = titleIdx === 0 ? 1 : 0;
  if (contentIdx === -1 && headers.length === 1) contentIdx = 0;

  return {
    titleIdx,
    contentIdx,
    tagsIdx, // -1 if none
    collectionIdx // -1 if none
  };
}

/**
 * Builds staged preview items from raw file descriptors or CSV rows.
 * Marks duplicates by comparing content hashes against existingPrompts.
 */
export function buildStagedPromptsFromFiles({
  files, // [{ name, relativePath, content }]
  strategy = IMPORT_STRATEGIES.SINGLE_PER_FILE,
  customDelimiter = '',
  csvMapping = null,
  existingPrompts = []
}) {
  const existingHashes = new Set();
  for (const p of existingPrompts) {
    if (Array.isArray(p?.chain) && p.chain.length > 1) {
      existingHashes.add(computeContentHash(p.chain.map(s => s?.content || '').join('\n\n')));
    } else {
      if (p?.content) {
        existingHashes.add(computeContentHash(p.content));
      }
      if (p?.chain?.[0]?.content) {
        existingHashes.add(computeContentHash(p.chain[0].content));
      }
    }
  }

  const stagedItems = [];
  const batchHashes = new Set();

  for (const file of files) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();

    // Handle CSV files
    if (ext === 'csv') {
      const { headers, rows } = parseCSVText(file.content);
      if (headers.length === 0 || rows.length === 0) continue;

      const mapping = csvMapping || guessCSVColumnMapping(headers);
      const cIdx = mapping.contentIdx >= 0 ? mapping.contentIdx : 0;
      const tIdx = mapping.titleIdx;
      const tagIdx = mapping.tagsIdx;
      const colIdx = mapping.collectionIdx;

      rows.forEach((row, rIndex) => {
        const rawContent = (row[cIdx] || '').trim();
        if (!rawContent) return;

        const hasExplicitCellTitle = Boolean(tIdx >= 0 && tIdx !== cIdx && row[tIdx] && row[tIdx].trim());
        const resolvedTitle = hasExplicitCellTitle
          ? row[tIdx].trim().replace(/[\s_-]+[a-f0-9]{32}$/i, '').trim() || `Prompt #${rIndex + 1}`
          : `${cleanExternalFilename(file.name)} #${rIndex + 1}`;

        const rowTags = [];
        if (tagIdx >= 0 && row[tagIdx]) {
          row[tagIdx].split(/[,;]+/).forEach(t => {
            const cleanTag = t.trim().replace(/^#/, '');
            if (cleanTag) rowTags.push(cleanTag);
          });
        }

        const suggestedCollection = (colIdx >= 0 && row[colIdx])
          ? row[colIdx].trim()
          : extractFolderCollectionName(file.relativePath);

        const hash = computeContentHash(rawContent);
        const isDuplicate = existingHashes.has(hash) || batchHashes.has(hash);
        batchHashes.add(hash);

        stagedItems.push({
          tempId: `stg_${ stagedItems.length }_${ Math.random().toString(36).slice(2, 7) }`,
          title: resolvedTitle,
          content: rawContent,
          tags: Array.from(new Set(rowTags)),
          suggestedCollection: suggestedCollection || null,
          sourceFile: file.name,
          rootFileName: file.name,
          variableCount: countPotentialVariables(rawContent),
          isDuplicate,
          selected: !isDuplicate
        });
      });
      continue;
    }

    // Standard Markdown / Text processing
    const { body, frontmatter } = extractFrontmatter(file.content);
    const baseTitle = frontmatter.title || cleanExternalFilename(file.name);
    const folderCollection = extractFolderCollectionName(file.relativePath);

    const chunks = segmentMarkdownContent(body, strategy, customDelimiter);
    chunks.forEach((chunk, idx) => {
      if (!chunk.trim()) return;
      const { title, content } = deriveChunkMetadata(chunk, baseTitle, idx, chunks.length);
      const hash = computeContentHash(content);
      const isDuplicate = existingHashes.has(hash) || batchHashes.has(hash);
      batchHashes.add(hash);

      stagedItems.push({
        tempId: `stg_${ stagedItems.length }_${ Math.random().toString(36).slice(2, 7) }`,
        title,
        content,
        tags: [...(frontmatter.tags || [])],
        suggestedCollection: folderCollection || null,
        sourceFile: file.name,
        rootFileName: file.name,
        variableCount: countPotentialVariables(content),
        isDuplicate,
        selected: !isDuplicate
      });
    });
  }

  return stagedItems;
}
