const HONORIFICS = new Set(["dr", "prof", "professor", "mr", "mrs", "ms"]);
const SCHOOL_STOP_WORDS = new Set(["cuny", "college", "school", "the", "of", "university"]);

function cleanText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(value) {
  let cleaned = cleanText(value);
  if (cleaned.includes(",")) {
    const [last, ...rest] = cleaned.split(",");
    cleaned = `${rest.join(" ")} ${last}`.trim();
  }

  return cleaned
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((token) => token && !HONORIFICS.has(token))
    .join(" ");
}

export function normalizeSchoolName(value) {
  return cleanText(value)
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((token) => token && !SCHOOL_STOP_WORDS.has(token))
    .join(" ");
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  return intersection.length / union.size;
}

export function scoreProfessorName(query, candidate) {
  const queryName = normalizeName(query);
  const candidateName = normalizeName(candidate);
  if (!queryName || !candidateName) return 0;
  if (queryName === candidateName) return 100;

  const queryTokens = queryName.split(" ");
  const candidateTokens = candidateName.split(" ");
  const queryFirst = queryTokens[0];
  const queryLast = queryTokens.at(-1);
  const candidateFirst = candidateTokens[0];
  const candidateLast = candidateTokens.at(-1);

  let score = tokenSimilarity(queryName, candidateName) * 35;
  if (queryLast === candidateLast) score += 45;
  if (queryFirst === candidateFirst) score += 30;
  else if (
    queryFirst?.[0] === candidateFirst?.[0] &&
    (queryFirst.length === 1 || candidateFirst.length === 1)
  ) score += 20;
  else if (
    queryFirst?.startsWith(candidateFirst) ||
    candidateFirst?.startsWith(queryFirst)
  ) score += 15;

  return Math.min(100, score);
}

export function selectProfessorResult(query, results = []) {
  const ranked = results
    .filter((result) => result?.node)
    .map((result) => ({
      result,
      score: scoreProfessorName(
        query,
        `${result.node.firstName || ""} ${result.node.lastName || ""}`,
      ),
    }))
    .sort((left, right) =>
      right.score - left.score ||
      (right.result.node.numRatings || 0) - (left.result.node.numRatings || 0),
    );
  return ranked[0]?.score >= 60 ? ranked[0].result : null;
}

export function selectSchoolResult(query, results = []) {
  const queryName = normalizeSchoolName(query);
  const ranked = results
    .filter((result) => result?.node?.name)
    .map((result) => {
      const candidateName = normalizeSchoolName(result.node.name);
      let score = tokenSimilarity(queryName, candidateName) * 100;
      if (queryName === candidateName) score = 120;
      else if (
        queryName && candidateName &&
        (queryName.includes(candidateName) || candidateName.includes(queryName))
      ) score += 25;
      return { result, score };
    })
    .sort((left, right) =>
      right.score - left.score ||
      (right.result.node.numRatings || 0) - (left.result.node.numRatings || 0),
    );
  return ranked[0]?.score >= 50 ? ranked[0].result : null;
}
