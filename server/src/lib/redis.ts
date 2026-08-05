import { Redis } from "ioredis";

const isDev = process.env.NODE_ENV !== "production";

// In-memory Redis substituto para desenvolvimento — suporta get/set/del/incr/expire/scan.
// Evita precisar de Redis real localmente sem sacrificar funcionalidades como 2FA.
class DevRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  private alive(key: string): boolean {
    const e = this.store.get(key);
    if (!e) return false;
    if (e.expiresAt && Date.now() > e.expiresAt) { this.store.delete(key); return false; }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key) ? this.store.get(key)!.value : null;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<"OK"> {
    let expiresAt: number | undefined;
    const exIdx = (args as string[]).findIndex(a => typeof a === "string" && a.toUpperCase() === "EX");
    if (exIdx !== -1 && args[exIdx + 1] != null) {
      expiresAt = Date.now() + Number(args[exIdx + 1]) * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async incr(key: string): Promise<number> {
    const e = this.store.get(key);
    const n = (e ? parseInt(e.value, 10) : 0) + 1;
    this.store.set(key, { value: String(n), expiresAt: e?.expiresAt });
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.store.get(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async scan(_cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
    return ["0", []];
  }

  async keys(_pattern: string): Promise<string[]> { return []; }

  on(_event: string, _fn: unknown): this { return this; }
  off(_event: string, _fn: unknown): this { return this; }
}

export const redis: Redis = isDev
  ? (new DevRedis() as unknown as Redis)
  : new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      },
    });

if (!isDev) {
  redis.on("connect", () => console.log("[Redis] Connected"));
  redis.on("error",   (err: Error) => console.error("[Redis] Error:", err.message));
} else {
  console.log("[Redis] Modo dev — usando store in-memory");
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch { /* Redis indisponível — ignora */ }
}

export async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch { /* Redis indisponível — ignora */ }
}
