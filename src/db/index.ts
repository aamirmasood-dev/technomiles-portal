import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

const pool =
  globalForDb.pool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,
    timezone: "Z",
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export * from "./schema";
