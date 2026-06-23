/**
 * Gemini API rate limit defaults (Free tier — gemini-2.5-flash, conservative):
 * - RPM: 10  → we target 8 RPM (7.5s between requests)
 * - RPD: 250
 * - TPM: 250,000
 *
 * Override via .env.local for your AI Studio tier.
 * @see https://ai.google.dev/gemini-api/docs/rate-limits
 */

const FREE_TIER_DEFAULTS = {
  model: 'gemini-2.5-flash',
  chunkSize: 100,
  minRequestIntervalMs: 7500,
  maxConcurrent: 1,
  maxRetries: 5,
  rpmLimit: 8,
  maxDailyRequests: 250,
};

function readInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getGeminiConfig() {
  const chunkSize = readInt('GEMINI_CHUNK_SIZE', FREE_TIER_DEFAULTS.chunkSize);
  const minRequestIntervalMs = readInt(
    'GEMINI_MIN_REQUEST_INTERVAL_MS',
    FREE_TIER_DEFAULTS.minRequestIntervalMs
  );
  const maxConcurrent = readInt('GEMINI_MAX_CONCURRENT', FREE_TIER_DEFAULTS.maxConcurrent);
  const maxRetries = readInt('GEMINI_MAX_RETRIES', FREE_TIER_DEFAULTS.maxRetries);
  const rpmLimit = readInt('GEMINI_RPM_LIMIT', FREE_TIER_DEFAULTS.rpmLimit);
  const maxDailyRequests = readInt(
    'GEMINI_MAX_DAILY_REQUESTS',
    FREE_TIER_DEFAULTS.maxDailyRequests
  );

  return {
    model: process.env.GEMINI_MODEL || FREE_TIER_DEFAULTS.model,
    chunkSize,
    minRequestIntervalMs,
    maxConcurrent: Math.max(1, maxConcurrent),
    maxRetries,
    rpmLimit,
    maxDailyRequests,
  };
}

export function estimateGeminiRequests(reviewCount, chunkSize) {
  const chunks = Math.max(1, Math.ceil(reviewCount / chunkSize));
  const synthesisCalls = chunks > 1 ? 1 : 0;
  return chunks + synthesisCalls;
}

export function estimateAnalysisDurationMs(reviewCount, config = getGeminiConfig()) {
  const requests = estimateGeminiRequests(reviewCount, config.chunkSize);
  return requests * config.minRequestIntervalMs;
}
