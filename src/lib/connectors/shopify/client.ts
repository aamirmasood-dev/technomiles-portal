import "server-only";
import { fetchWithRetry, sleep } from "../http";
import { ConnectorError } from "../types";

export const SHOPIFY_API_VERSION = "2026-07";

export type ShopifyCreds =
  | { shopDomain: string; clientId: string; clientSecret: string }
  | { shopDomain: string; accessToken: string }; // legacy shpat_ admin token

// "kensingtons.myshopify.com", "https://kensingtons.myshopify.com/admin" -> "kensingtons.myshopify.com"
export function normalizeShopDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) return host;
  if (/^[a-z0-9][a-z0-9-]*$/.test(host)) return `${host}.myshopify.com`;
  return null;
}

// Client-credentials tokens last ~24h; cache per shop until shortly before expiry.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(creds: ShopifyCreds): Promise<string> {
  if ("accessToken" in creds) return creds.accessToken;
  const key = `${creds.shopDomain}|${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetchWithRetry(`https://${creds.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "client_credentials" }),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;
  if (!res.ok || !body?.access_token) {
    const why = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new ConnectorError(`Shopify refused the Client ID / Client Secret (${why}). Check both values and that the app is installed on this store.`);
  }
  tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 86399) * 1000 });
  return body.access_token;
}

type GqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

export async function shopifyGraphql<T>(creds: ShopifyCreds, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const token = await accessToken(creds);
    const res = await fetchWithRetry(`https://${creds.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 || res.status === 403) {
      tokenCache.delete(`${creds.shopDomain}|${"clientId" in creds ? creds.clientId : ""}`);
      if (attempt === 1 && !("accessToken" in creds)) continue; // token may have expired early
      throw new ConnectorError(`Shopify denied access (HTTP ${res.status}). Check the app is installed and has the required scopes.`);
    }
    if (res.status === 404) throw new ConnectorError(`Shop ${creds.shopDomain} was not found. Use the store's .myshopify.com address.`);
    const body = (await res.json()) as GqlResponse<T>;
    if (body.errors?.some((e) => e.extensions?.code === "THROTTLED") && attempt < 8) {
      const t = body.extensions?.cost?.throttleStatus;
      await sleep(t ? Math.max(1000, (1000 / t.restoreRate) * 200) : 2000);
      continue;
    }
    if (body.errors?.length) {
      const msg = body.errors.map((e) => e.message).join("; ");
      if (/access denied|ACCESS_DENIED/i.test(msg)) {
        throw new ConnectorError(`Missing permission: ${msg}. Add the scopes listed on the store page to the app and release a new version.`);
      }
      throw new ConnectorError(`Shopify error: ${msg}`);
    }
    return body.data as T;
  }
}
