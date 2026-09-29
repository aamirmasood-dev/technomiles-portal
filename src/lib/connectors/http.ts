import "server-only";
import { ConnectorError } from "./types";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch with retries on 429 / 5xx and network errors, honouring Retry-After.
export async function fetchWithRetry(url: string, init: RequestInit, tries = 5): Promise<Response> {
  let wait = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
      if ((res.status === 429 || res.status >= 500) && attempt < tries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : wait);
        wait *= 2;
        continue;
      }
      return res;
    } catch (e) {
      if (attempt >= tries) throw new ConnectorError(`Network error: ${e instanceof Error ? e.message : e}`);
      await sleep(wait);
      wait *= 2;
    }
  }
}
