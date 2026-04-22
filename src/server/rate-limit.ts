const WINDOW_MS = 60_000;
const MAX_REQUESTS_DEFAULT = 40;
/** События NPC, будущие ручки сохранения/инвентаря — отдельный, более мягкий bucket. */
const MAX_REQUESTS_WRITE = 120;

export type RateLimitTier = "default" | "write";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function bucketKey(ip: string, tier: RateLimitTier): string {
  return `${tier}:${ip}`;
}

function maxForTier(tier: RateLimitTier): number {
  return tier === "write" ? MAX_REQUESTS_WRITE : MAX_REQUESTS_DEFAULT;
}

/**
 * @param tier `write` — повышенный лимит для записи на диск (сейв/инвентарь/events NPC).
 */
export function rateLimit(ip: string, tier: RateLimitTier = "default"): boolean {
  const now = Date.now();
  const k = bucketKey(ip, tier);
  let b = buckets.get(k);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(k, b);
  }
  b.count += 1;
  return b.count <= maxForTier(tier);
}

export function getClientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) {
    return xf.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}
