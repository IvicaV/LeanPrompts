/**
 * ============================================================================
 * LeanPrompts Studio
 * Tooltip Helper Utilities for Prompts, Snippets & KB Items
 * ============================================================================
 */

/**
 * Format ISO date string into standard display string e.g. "12. Jan 2025, 14:30"
 */
export function formatTooltipDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}. ${month} ${year}, ${hours}:${minutes}`;
  } catch (e) {
    return null;
  }
}

/**
 * Generate standard English hover tooltip text for prompts, snippets, or KB items.
 * Output format:
 * [Title / Name]
 * Created: 12. Jan 2025, 14:30
 * Last Modified: 04. Feb 2026, 09:15
 */
export function getItemTooltip(item, customTitle) {
  if (!item) return customTitle || '';
  const title = customTitle !== undefined ? customTitle : (item.title || (item.name ? `@${item.name}` : ''));
  const created = formatTooltipDate(item.createdAt);
  const modified = formatTooltipDate(item.updatedAt);
  
  const parts = [];
  if (title) parts.push(title);
  if (created) parts.push(`Created: ${created}`);
  if (modified) parts.push(`Last Modified: ${modified}`);
  
  return parts.join('\n');
}
