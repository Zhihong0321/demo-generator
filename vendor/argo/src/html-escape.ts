/**
 * HTML-escape text for safe insertion into attribute values and text content.
 * Covers &, <, >, " — single quotes are rare in inline style contexts and
 * existing escape callers never quoted attributes with '. Matches the
 * pre-existing duplicate implementations this replaces.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
