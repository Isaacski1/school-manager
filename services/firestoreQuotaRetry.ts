/**
 * Client-side Firestore quota/backoff helper.
 *
 * When the Firestore daily quota is exhausted, raw Firestore reads throw
 * `8 RESOURCE_EXHAUSTED: Quota exceeded.` (code 8 / "resource-exhausted").
 * Without retry/backoff this error propagates and can crash a whole page —
 * which is exactly what happens to the Parent dashboard, whose student
 * discovery runs many raw queries in parallel.
 *
 * This helper wraps a Firestore operation with exponential backoff and a
 * short grace-period delay so fast local calls never trigger a retry, while
 * quota errors are retried a few times before giving up gracefully.
 */

const QUOTA_ERROR_CODES = new Set(["8", "resource-exhausted"]);

export const isFirestoreQuotaError = (err: any): boolean => {
  const code = String(err?.code || err?.errorInfo?.code || "").toLowerCase();
  const message = String(err?.message || err || "").toLowerCase();
  return (
    QUOTA_ERROR_CODES.has(code) ||
    message.includes("quota exceeded") ||
    message.includes("resource exhausted")
  );
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `operation` with exponential backoff on Firestore quota errors.
 * Non-quota errors are rethrown immediately.
 */
export const withFirestoreQuotaRetry = async <T>(
  label: string,
  operation: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number },
): Promise<T> => {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 8000;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isFirestoreQuotaError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      console.warn(
        `[Firestore] ${label} hit quota limit. Backing off ${delay}ms before retry ${attempt + 2}/${maxAttempts}...`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
};

export default withFirestoreQuotaRetry;