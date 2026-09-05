type RateRecord = {
  count: number;
  resetAt: number;
};

const rateLimitMap = new Map<string, RateRecord>();
const WINDOW_MS = 60 * 1000; // 1 minute sliding window
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 AI generation requests per minute per admin

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetInMs: WINDOW_MS };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetInMs: record.resetAt - now };
  }

  record.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count, resetInMs: record.resetAt - now };
}
