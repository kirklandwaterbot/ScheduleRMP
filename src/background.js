import {
  normalizeName,
  normalizeSchoolName,
  selectProfessorResult,
  selectSchoolResult,
} from "./matching.js";

const GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const DEFAULT_SETTINGS = Object.freeze({
  masterEnabled: true,
  enabled: true,
  hideUnrated: false,
  calendarExport: true,
  cacheHours: 12,
});
const RATING_CACHE_KEY = "ratingCache";
const SCHOOL_CACHE_KEY = "schoolCache";
const SCHOOL_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const ratingInFlight = new Map();
const schoolInFlight = new Map();
let ratingCachePromise;
let schoolCachePromise;

const SCHOOL_QUERY = `
  query NewSearchSchoolsQuery($query: SchoolSearchQuery!) {
    newSearch {
      schools(query: $query) {
        edges {
          node { id legacyId name city state numRatings }
        }
      }
    }
  }
`;

const PROFESSOR_QUERY = `
  query NewSearchTeachersQuery($query: TeacherSearchQuery!, $count: Int) {
    newSearch {
      teachers(query: $query, first: $count) {
        edges {
          node {
            id
            legacyId
            firstName
            lastName
            avgRating
            avgDifficulty
            numRatings
            wouldTakeAgainPercent
            department
            teacherRatingTags { tagName tagCount }
            school { id legacyId name }
          }
        }
      }
    }
  }
`;

async function getSettings() {
  const stored = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function getStoredCache(storageKey, promiseName) {
  if (promiseName === "rating" && !ratingCachePromise) {
    ratingCachePromise = browser.storage.local
      .get(storageKey)
      .then((stored) => stored[storageKey] || {});
  }
  if (promiseName === "school" && !schoolCachePromise) {
    schoolCachePromise = browser.storage.local
      .get(storageKey)
      .then((stored) => stored[storageKey] || {});
  }
  return promiseName === "rating" ? ratingCachePromise : schoolCachePromise;
}

async function getRatingCache() {
  return getStoredCache(RATING_CACHE_KEY, "rating");
}

async function getSchoolCache() {
  return getStoredCache(SCHOOL_CACHE_KEY, "school");
}

async function getCachedRating(key, cacheHours) {
  const cache = await getRatingCache();
  const entry = cache[key];
  const maxAge = Math.max(1, Number(cacheHours) || 12) * 60 * 60 * 1000;
  if (!entry || Date.now() - entry.savedAt > maxAge) {
    if (entry) {
      delete cache[key];
      await browser.storage.local.set({ [RATING_CACHE_KEY]: cache });
    }
    return null;
  }
  return { ...entry.value, cached: true };
}

async function saveCachedRating(key, value) {
  const cache = await getRatingCache();
  cache[key] = { savedAt: Date.now(), value };
  await browser.storage.local.set({ [RATING_CACHE_KEY]: cache });
}

async function postGraphQL(query, operationName, variables) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, operationName, variables }),
  });
  if (!response.ok) throw new Error(`RMP request failed with status ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message).join("; "));
  }
  return payload.data;
}

async function resolveSchool(schoolName) {
  const key = normalizeSchoolName(schoolName);
  if (!key) return null;

  const cache = await getSchoolCache();
  const cached = cache[key];
  if (cached?.value?.id && Date.now() - cached.savedAt <= SCHOOL_CACHE_MAX_AGE) {
    return cached.value;
  }

  if (!schoolInFlight.has(key)) {
    const request = postGraphQL(SCHOOL_QUERY, "NewSearchSchoolsQuery", {
      query: { text: schoolName },
    })
      .then(async (data) => {
        const result = selectSchoolResult(schoolName, data?.newSearch?.schools?.edges || []);
        const school = result?.node || null;
        cache[key] = { savedAt: Date.now(), value: school };
        await browser.storage.local.set({ [SCHOOL_CACHE_KEY]: cache });
        return school;
      })
      .finally(() => schoolInFlight.delete(key));
    schoolInFlight.set(key, request);
  }

  return schoolInFlight.get(key);
}

function normalizeTags(tags) {
  return (tags || [])
    .map((tag) => ({
      name: String(tag?.tagName || "").trim(),
      count: Number(tag?.tagCount) || 0,
    }))
    .filter((tag) => tag.name)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function toRatingResult(edge) {
  const professor = edge.node;
  return {
    status: "ok",
    rating: professor.avgRating,
    numRatings: professor.numRatings,
    difficulty: professor.avgDifficulty,
    wouldTakeAgain: professor.wouldTakeAgainPercent,
    tags: normalizeTags(professor.teacherRatingTags),
    formattedName: `${professor.firstName || ""} ${professor.lastName || ""}`.trim(),
    department: professor.department || "",
    link: `https://www.ratemyprofessors.com/professor/${professor.legacyId}`,
    cached: false,
  };
}

async function fetchRatingAtSchool(professorName, school) {
  const data = await postGraphQL(PROFESSOR_QUERY, "NewSearchTeachersQuery", {
    count: 8,
    query: { text: professorName, schoolID: school.id, fallback: true },
  });
  const professor = selectProfessorResult(
    professorName,
    data?.newSearch?.teachers?.edges || [],
  );
  return professor
    ? toRatingResult(professor)
    : { status: "not_found", reason: "professor", cached: false };
}

async function getRatingForSchool(professorName, school, cacheHours) {
  const key = `${school.id}::${normalizeName(professorName)}`;
  const cached = await getCachedRating(key, cacheHours);
  if (cached) return cached;

  if (!ratingInFlight.has(key)) {
    const request = fetchRatingAtSchool(professorName, school)
      .then(async (result) => {
        await saveCachedRating(key, result);
        return result;
      })
      .finally(() => ratingInFlight.delete(key));
    ratingInFlight.set(key, request);
  }
  return ratingInFlight.get(key);
}

async function getProfessorRatings(data) {
  const names = [...new Set((data?.professorNames || [])
    .map((name) => String(name || "").trim())
    .filter(Boolean))];
  const schoolName = String(data?.schoolName || "").trim();
  if (!names.length || !schoolName || schoolName === "NA") {
    return {
      status: "not_found",
      results: Object.fromEntries(names.map((name) => [name, {
        status: "not_found",
        reason: "missing_data",
        cached: false,
      }])),
    };
  }

  const settings = await getSettings();
  if (!settings.masterEnabled || !settings.enabled) {
    return {
      status: "disabled",
      results: Object.fromEntries(names.map((name) => [name, { status: "disabled" }])),
    };
  }

  const school = await resolveSchool(schoolName);
  if (!school?.id) {
    return {
      status: "not_found",
      results: Object.fromEntries(names.map((name) => [name, {
        status: "not_found",
        reason: "school",
        cached: false,
      }])),
    };
  }

  const entries = await Promise.all(names.map(async (name) => {
    try {
      return [name, await getRatingForSchool(name, school, settings.cacheHours)];
    } catch (error) {
      return [name, {
        status: "error",
        code: "RMP_UNAVAILABLE",
        message: error?.message || "Rate My Professors is temporarily unavailable.",
      }];
    }
  }));
  return { status: "ok", schoolName: school.name, results: Object.fromEntries(entries) };
}

async function getProfessorRating(data) {
  const name = String(data?.professorName || "").trim();
  const response = await getProfessorRatings({
    professorNames: name ? [name] : [],
    schoolName: data?.schoolName,
  });
  return response.results?.[name] || { status: "not_found", reason: "missing_data" };
}

async function clearCache() {
  ratingCachePromise = Promise.resolve({});
  schoolCachePromise = Promise.resolve({});
  await browser.storage.local.remove([RATING_CACHE_KEY, SCHOOL_CACHE_KEY]);
  return { status: "ok" };
}

async function getCacheStats() {
  const cache = await getRatingCache();
  return { status: "ok", entries: Object.keys(cache).length };
}

browser.runtime.onMessage.addListener(async (request) => {
  try {
    if (request?.action === "getProfessorRatings") {
      return await getProfessorRatings(request.data);
    }
    if (request?.action === "getProfessorRating") {
      return await getProfessorRating(request.data);
    }
    if (request?.action === "clearCache") return await clearCache();
    if (request?.action === "getCacheStats") return await getCacheStats();
    return { status: "error", code: "UNKNOWN_ACTION" };
  } catch (error) {
    console.warn("ScheduleRMP request failed", error?.message || error);
    return {
      status: "error",
      code: "RMP_UNAVAILABLE",
      message: "Rate My Professors is temporarily unavailable.",
    };
  }
});
