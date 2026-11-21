/** Strict JSON lexical scanner port of DreamwishWand/web safe-edit-session.js. */
const MAX_JSON_DEPTH = 256;
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
export function parseSafeJson(source) {
  if (typeof source !== 'string' || source.length === 0) throw new Error('Decoded profile JSON is empty.');
  rejectDuplicateObjectKeys(source);
  rejectUnsafeJsonNumbers(source);
  const value = JSON.parse(source);
  const root = asObject(value);
  if (!root) throw new Error('Decoded profile JSON root must be an object.');
  return root;
}

/** @param {string} source */
function rejectDuplicateObjectKeys(source) {
  /** @type {(Set<string>|null)[]} */
  const stack = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      const start = i;
      for (i += 1; i < source.length; i += 1) {
        if (source[i] === '\\') { i += 1; continue; }
        if (source[i] === '"') break;
      }
      if (i >= source.length) throw new Error('Unterminated JSON string.');
      const top = stack[stack.length - 1];
      if (!top) continue;
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      if (source[j] === ':') {
        const key = JSON.parse(source.slice(start, i + 1));
        if (typeof key !== 'string') throw new Error('Invalid JSON object key.');
        if (top.has(key)) throw new Error('Duplicate JSON object key; export blocked.');
        top.add(key);
      }
    } else if (ch === '{') {
      stack.push(new Set());
    } else if (ch === '[') {
      stack.push(null);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
    if (stack.length > MAX_JSON_DEPTH) throw new Error('JSON nesting exceeds the supported safety limit.');
  }
  if (stack.length !== 0) throw new Error('Unbalanced JSON structure.');
}

/** @param {string} source */
function rejectUnsafeJsonNumbers(source) {
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch !== '-' && (ch < '0' || ch > '9')) continue;

    const match = source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?/);
    if (!match) continue;
    const token = match[0];
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('JSON number is not finite.');

    if (/^-?(?:0|[1-9]\d*)$/.test(token)) {
      const integer = BigInt(token);
      if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error('Unsafe JSON integer: cannot guarantee data preservation.');
      }
    } else if (value === 0 && !/^-?0(?:\.0*)?(?:[eE][+\-]?\d+)?$/.test(token)) {
      throw new Error('Underflowed JSON number: cannot guarantee data preservation.');
    }
    i += token.length - 1;
  }
}

