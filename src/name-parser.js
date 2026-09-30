const IGNORED_NAMES = new Set([
  "",
  "staff",
  "instructor",
  "instructors",
  "tba",
  "to be announced",
  "arranged",
]);

export function extractProfessorNames(input) {
  const cleaned = cleanupInput(input);
  if (!cleaned) return [];

  const names = splitByListSeparators(cleaned)
    .map(cleanupName)
    .filter(isLikelyProfessorName);

  return dedupe(names);
}

export function normalizeForLookup(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupInput(value) {
  return String(value ?? "")
    .replace(/\brmp[\s-]*rating[s]?\b/gi, " ")
    .replace(/\b(?:Instructor|Professor)\(s\)\s*:/gi, " ")
    .replace(/\b(?:Instructor|Professor)s?\s*:/gi, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function splitByListSeparators(value) {
  const firstPass = value
    .split(/\n|;|\/|&|\band\b/gi)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const segments = [];

  for (const segment of firstPass) {
    const commaParts = segment.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (commaParts.length === 2 && commaParts.every(isSingleToken)) {
      segments.push(`${commaParts[1]} ${commaParts[0]}`);
    } else if (commaParts.length > 1 && commaParts.every((part) => part.split(/\s+/).length >= 2)) {
      segments.push(...commaParts);
    } else {
      segments.push(segment);
    }
  }

  return segments;
}

function cleanupName(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:Dr|Prof|Professor|Mr|Mrs|Ms)\.?\s+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyProfessorName(value) {
  if (!value || IGNORED_NAMES.has(value.toLowerCase())) return false;
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((part) => /^[\p{L}.'-]+$/u.test(part));
}

function dedupe(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalizeForLookup(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSingleToken(value) {
  return value.split(/\s+/).filter(Boolean).length === 1;
}
