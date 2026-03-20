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

module.exports = { stripHtml, sanitizeFields, wrapUserContent, validateFile };
