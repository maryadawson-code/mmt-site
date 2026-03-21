/**
 * sanitize.js — Input sanitization utilities for Netlify functions.
 *
 * Strips HTML tags, wraps user content for LLM prompts,
 * validates MIME types, and logs sanitization events.
 */

/**
 * Strip HTML tags from a string. Preserves text content.
 * Logs a warning if any tags were removed.
 */
function stripHtml(input, { fieldName = "input", logger = console } = {}) {
  if (typeof input !== "string") return input;
  const cleaned = input.replace(/<[^>]*>/g, "");
  if (cleaned !== input) {
    logger.warn(`[sanitize] HTML stripped from ${fieldName}: removed ${input.length - cleaned.length} chars`);
  }
  return cleaned;
}

/**
 * Sanitize an object's string fields by stripping HTML.
 * Returns a new object with cleaned values.
 */
function sanitizeFields(obj, fieldNames, { logger = console } = {}) {
  const result = { ...obj };
  for (const field of fieldNames) {
    if (typeof result[field] === "string") {
      result[field] = stripHtml(result[field], { fieldName: field, logger });
    }
  }
  return result;
}

/**
 * Wrap user-provided content in delimiter tags for LLM prompts.
 * This helps the model distinguish instructions from user content.
 */
function wrapUserContent(text) {
  if (!text) return text;
  return `<user_input>\n${text}\n</user_input>`;
}

/**
 * Validate that a file's MIME type matches its extension.
 * Returns { valid, reason } object.
 */
const MIME_EXTENSION_MAP = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-powerpoint": [".ppt", ".pptx"],
  "application/msword": [".doc", ".docx"],
};

const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".js", ".vbs", ".wsf", ".ps1", ".sh", ".bash",
];

function validateFile(fileName, mimeType) {
  if (!fileName || !mimeType) {
    return { valid: false, reason: "Missing file name or MIME type" };
  }

  const ext = ("." + fileName.split(".").pop()).toLowerCase();

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, reason: `Blocked file extension: ${ext}` };
  }

  const allowedExts = MIME_EXTENSION_MAP[mimeType];
  if (allowedExts && !allowedExts.some((e) => ext.endsWith(e))) {
    return { valid: false, reason: `MIME type ${mimeType} does not match extension ${ext}` };
  }

  return { valid: true };
}

/**
 * Truncate a string to a maximum length.
 * Logs a warning if truncation occurred.
 */
function truncate(input, maxLength, { fieldName = "input", logger = console } = {}) {
  if (typeof input !== "string") return input;
  if (input.length <= maxLength) return input;
  logger.warn(`[sanitize] Truncated ${fieldName} from ${input.length} to ${maxLength} chars`);
  return input.slice(0, maxLength);
}

/**
 * Detect obvious prompt injection patterns in user input.
 * Returns { safe: true } or { safe: false, reason }.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?(previous|above|prior)\s+instructions/i,
  /you\s+are\s+now\s+(a|an|in)\s/i,
  /system\s*:\s*you\s+are/i,
  /\bdo\s+not\s+follow\s+(the\s+)?(previous|above|prior|system)\b/i,
  /\boverride\s+(all\s+)?(previous|system|safety)\b/i,
];

function checkPromptInjection(input) {
  if (typeof input !== "string") return { safe: true };
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

/**
 * Full sanitization pipeline for user text input before LLM calls.
 * Strips HTML, truncates to maxLength, checks for prompt injection.
 * Returns { text, blocked, reason }.
 */
function sanitizeUserInput(input, { maxLength = 10000, fieldName = "input", logger = console } = {}) {
  if (typeof input !== "string") return { text: "", blocked: false };
  let text = stripHtml(input, { fieldName, logger });
  text = truncate(text, maxLength, { fieldName, logger });
  const injection = checkPromptInjection(text);
  if (!injection.safe) {
    logger.warn(`[sanitize] Prompt injection detected in ${fieldName}: ${injection.reason}`);
    return { text, blocked: true, reason: injection.reason };
  }
  return { text, blocked: false };
}

module.exports = { stripHtml, sanitizeFields, wrapUserContent, validateFile, truncate, checkPromptInjection, sanitizeUserInput };
