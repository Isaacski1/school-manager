type CacheEnvelope<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();

const isBrowser = typeof window !== "undefined";

const getStorage = () => {
  if (!isBrowser) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function getClientCache<T>(key: string): T | null {
  const now = Date.now();
  const fromMemory = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (fromMemory) {
    if (fromMemory.expiresAt > now) {
      return fromMemory.value;
    }
    memoryCache.delete(key);
  }

  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") {
      storage.removeItem(key);
      return null;
    }
    if (parsed.expiresAt <= now) {
      storage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed as CacheEnvelope<unknown>);
    return parsed.value;
  } catch {
    return null;
  }
}

export function setClientCache<T>(key: string, value: T, ttlMs: number): void {
  const envelope: CacheEnvelope<T> = {
    value,
    expiresAt: Date.now() + Math.max(1_000, ttlMs),
  };
  memoryCache.set(key, envelope as CacheEnvelope<unknown>);

  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage write errors.
  }
}

export function clearClientCache(key: string): void {
  memoryCache.delete(key);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage remove errors.
  }
}

export async function resolveClientCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options?: { forceRefresh?: boolean },
): Promise<T> {
  if (!options?.forceRefresh) {
    const cached = getClientCache<T>(key);
    if (cached !== null) return cached;
  }
  const loaded = await loader();
  setClientCache(key, loaded, ttlMs);
  return loaded;
}
