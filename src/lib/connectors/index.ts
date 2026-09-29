import "server-only";
import type { Platform } from "@/db/schema";
import type { Connector } from "./types";
import { shopifyConnector } from "./shopify";

// Add eBay, Amazon and Walmart here as they are built; nothing else needs to change.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONNECTORS: Partial<Record<Platform, Connector<any>>> = {
  SHOPIFY: shopifyConnector,
};
