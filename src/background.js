import * as rmp from "ratemyprofessor-api";
import {
  normalizeName,
  normalizeSchoolName,
  selectProfessorResult,
  selectSchoolResult,
} from "./matching.js";

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, hideUnrated: false, cacheHours: 12 });
const CACHE_STORAGE_KEY = "ratingCache";
const inFlight = new Map();
let cachePromise;

async function getSettings() {
  const stored = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function getCache() {
  if (!cachePromise) {
    cachePromise = browser.storage.local
      .get(CACHE_STORAGE_KEY)
      .then((stored) => stored[CACHE_STORAGE_KEY] || {});
  }
  return cachePromise;
}

async function getCachedRating(key, cacheHours) {
  const cache = await getCache();
  const entry = cache[key];
  const maxAge = Math.max(1, Number(cacheHours) || 12) * 60 * 60 * 1000;

  if (!entry || Date.now() - entry.savedAt > maxAge) {
    if (entry) {
      delete cache[key];
      await browser.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
    }
    return null;
  }

  return { ...entry.value, cached: true };
}

async function saveCachedRating(key, value) {
  const cache = await getCache();
  cache[key] = { savedAt: Date.now(), value };
  await browser.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
}

function toRatingResult(edge) {
  const professor = edge.node;
  return {
    status: "ok",
    rating: professor.avgRating,
    numRatings: professor.numRatings,
    difficulty: professor.avgDifficulty,
    wouldTakeAgain: professor.wouldTakeAgainPercent,
    formattedName: `${professor.firstName} ${professor.lastName}`.trim(),
    department: professor.department || "",
    link: `https://www.ratemyprofessors.com/professor/${professor.legacyId}`,
    cached: false,
  };
}

async function fetchRating(professorName, schoolName) {
  const schools = await rmp.searchSchool(schoolName);
  if (!schools) throw new Error("RMP school search was unavailable");

  const school = selectSchoolResult(schoolName, schools);
  if (!school?.node?.id) {
    return { status: "not_found", reason: "school", cached: false };
  }

  const professors = await rmp.searchProfessorsAtSchoolId(professorName, school.node.id);
  if (!professors) throw new Error("RMP professor search was unavailable");

  const professor = selectProfessorResult(professorName, professors);
  if (!professor) {
    return { status: "not_found", reason: "professor", cached: false };
  }

  return toRatingResult(professor);
}

async function getProfessorRating(data) {
  const professorName = String(data?.professorName || "").trim();
  const schoolName = String(data?.schoolName || "").trim();
  if (!professorName || !schoolName || schoolName === "NA") {
    return { status: "not_found", reason: "missing_data", cached: false };
  }

  const settings = await getSettings();
  const key = `${normalizeSchoolName(schoolName)}::${normalizeName(professorName)}`;
  const cached = await getCachedRating(key, settings.cacheHours);
  if (cached) return cached;

  if (!inFlight.has(key)) {
    const request = fetchRating(professorName, schoolName)
      .then(async (result) => {
        await saveCachedRating(key, result);
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }

  return inFlight.get(key);
}

async function clearCache() {
  cachePromise = Promise.resolve({});
  await browser.storage.local.remove(CACHE_STORAGE_KEY);
  return { status: "ok" };
}

async function getCacheStats() {
  const cache = await getCache();
  return { status: "ok", entries: Object.keys(cache).length };
}

browser.runtime.onMessage.addListener(async (request) => {
  try {
    if (request?.action === "getProfessorRating") {
      return await getProfessorRating(request.data);
    }
    if (request?.action === "clearCache") return await clearCache();
    if (request?.action === "getCacheStats") return await getCacheStats();
    return { status: "error", code: "UNKNOWN_ACTION" };
  } catch (error) {
    console.warn("Schedule Builder RMP request failed", error?.message || error);
    return {
      status: "error",
      code: "RMP_UNAVAILABLE",
      message: "Rate My Professors is temporarily unavailable.",
    };
  }
});
