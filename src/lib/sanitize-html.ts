import DOMPurify from "isomorphic-dompurify";

/**
 * Server-side HTML sanitiser for rich-text fields that end up on
 * public pages (proPages intro + text sections). Keeps the formatting
 * TipTap produces and blocks anything that smells like XSS.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "hr",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
    ALLOW_DATA_ATTR: false,
  });
}
