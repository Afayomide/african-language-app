/**
 * Retry a request that failed for a reason that may pass on its own: no connection, a
 * timeout, or a server error. A refusal (400, 401, 403, 404, 409...) is final, so it is
 * thrown at once rather than repeated.
 */
export function isTransientError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  if (typeof status !== 'number') return true // no response at all: network down or request aborted
  return status === 408 || status === 429 || status >= 500
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(
  request: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (attempt === attempts || !isTransientError(error)) break
      await wait(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw lastError
}
