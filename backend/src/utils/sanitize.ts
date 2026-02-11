/**
 * Input sanitization utilities for preventing XSS and injection attacks.
 * Strips HTML tags and dangerous content from user input.
 */

/** Strip HTML tags from a string */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/** Sanitize a string value: trim, strip HTML tags, limit length */
export function sanitizeString(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return stripHtml(input).trim().slice(0, maxLength);
}

/**
 * Recursively sanitize all string values in an object/array.
 * Returns a new object with sanitized values.
 */
export function sanitizeObject(obj: unknown, maxStringLength = 1000): unknown {
  if (typeof obj === 'string') {
    return sanitizeString(obj, maxStringLength);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxStringLength));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value, maxStringLength);
    }
    return result;
  }
  return obj;
}

/**
 * Remove empty/falsy string values from a JSON string representing an object.
 * Parses the JSON, removes keys with empty string values, and re-serializes.
 * For nested objects, recursively strips empty values.
 * Returns the cleaned JSON string.
 */
export function stripEmptyValues(jsonStr: string): string {
  if (!jsonStr) return '';
  try {
    const obj = JSON.parse(jsonStr);
    const cleaned = removeEmptyStrings(obj);
    // If the cleaned object is empty, return empty string
    if (typeof cleaned === 'object' && cleaned !== null && Object.keys(cleaned).length === 0) {
      return '';
    }
    return JSON.stringify(cleaned);
  } catch {
    return jsonStr;
  }
}

/**
 * Recursively remove keys with empty string values from an object.
 * For arrays, filter out items that are entirely empty.
 */
function removeEmptyStrings(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    const filtered = obj
      .map(item => removeEmptyStrings(item))
      .filter(item => {
        if (item === null || item === undefined || item === '') return false;
        if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item as object).length === 0) return false;
        return true;
      });
    return filtered.length > 0 ? filtered : [];
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value === '' || value === null || value === undefined) continue;
      const cleaned = removeEmptyStrings(value);
      if (cleaned === '' || cleaned === null || cleaned === undefined) continue;
      if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      result[key] = cleaned;
    }
    return result;
  }
  return obj;
}

/**
 * Sanitize a JSON string: parse, sanitize all string values, strip empty values, re-serialize.
 */
export function sanitizeJsonString(jsonStr: string, maxStringLength = 1000): string {
  if (!jsonStr) return '';
  try {
    const obj = JSON.parse(jsonStr);
    const sanitized = sanitizeObject(obj, maxStringLength);
    const cleaned = removeEmptyStrings(sanitized);
    if (typeof cleaned === 'object' && cleaned !== null && Object.keys(cleaned).length === 0) {
      return '';
    }
    return JSON.stringify(cleaned);
  } catch {
    return sanitizeString(jsonStr, maxStringLength);
  }
}
