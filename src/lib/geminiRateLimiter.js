import { getGeminiConfig } from '@/lib/geminiConfig';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sharedLimiter = null;

export class GeminiRateLimiter {
  constructor(config = getGeminiConfig()) {
    this.minIntervalMs = config.minRequestIntervalMs;
    this.lastRequestAt = 0;
    this.pending = Promise.resolve();
  }

  async schedule(task) {
    const run = async () => {
      const now = Date.now();
      const waitMs = this.minIntervalMs - (now - this.lastRequestAt);

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      try {
        return await task();
      } finally {
        this.lastRequestAt = Date.now();
      }
    };

    const result = this.pending.then(run, run);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function getGeminiRateLimiter() {
  if (!sharedLimiter) {
    sharedLimiter = new GeminiRateLimiter();
  }

  return sharedLimiter;
}

export function resetGeminiRateLimiterForTests() {
  sharedLimiter = null;
}
