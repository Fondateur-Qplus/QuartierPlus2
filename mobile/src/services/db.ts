import * as SQLite from "expo-sqlite";
import { getSharedDatabase, initializeSharedDatabase } from "./database";

export type QueueStatus = "pending" | "processing" | "failed";
export type SyncActionType = "create_post" | "trigger_sos";
export type SyncAction = {
  id: number;
  actionType: SyncActionType;
  payload: Record<string, unknown>;
  status: QueueStatus;
  createdAt: string;
  attempts: number;
};

const getDatabase = getSharedDatabase;

const logCacheFailure = (error: unknown) => {
  console.warn("Cache SQLite indisponible.", error);
};

const saveCollection = async (
  table: "cached_posts" | "cached_alerts",
  entries: unknown[],
) => {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Entrée invalide pour ${table}.`);
      }
      const id = (entry as Record<string, unknown>).id;
      if (typeof id !== "string" && typeof id !== "number") {
        throw new Error(`Chaque entrée ${table} doit avoir un identifiant.`);
      }
      await transaction.runAsync(
        `INSERT INTO ${table} (id, payload, cached_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           cached_at = CURRENT_TIMESTAMP`,
        String(id),
        JSON.stringify(entry),
      );
    }
    await transaction.execAsync(
      `DELETE FROM ${table}
       WHERE id NOT IN (
         SELECT id FROM ${table}
         ORDER BY cached_at DESC
         LIMIT 500
       )`,
    );
  });
};

const loadCollection = async <T>(
  table: "cached_posts" | "cached_alerts",
): Promise<T[]> => {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM ${table} ORDER BY cached_at DESC`,
  );
  return rows.map((row) => JSON.parse(row.payload) as T);
};

export const initializeDatabase = initializeSharedDatabase;

export const cachePosts = (posts: unknown[]) =>
  saveCollection("cached_posts", posts).catch((error: unknown) => {
    logCacheFailure(error);
  });

export const getCachedPosts = <T = unknown>() =>
  loadCollection<T>("cached_posts").catch((error: unknown) => {
    logCacheFailure(error);
    return [] as T[];
  });

export const cacheAlerts = (alerts: unknown[]) =>
  saveCollection("cached_alerts", alerts).catch((error: unknown) => {
    logCacheFailure(error);
  });

export const getCachedAlerts = <T = unknown>() =>
  loadCollection<T>("cached_alerts").catch((error: unknown) => {
    logCacheFailure(error);
    return [] as T[];
  });

export const cacheMessages = async (
  threadKey: string,
  messages: unknown[],
): Promise<void> => {
  if (!threadKey.trim()) throw new Error("La conversation à mettre en cache est invalide.");
  try {
    const database = await getDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const message of messages) {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          throw new Error("Un message à mettre en cache est invalide.");
        }
        const id = (message as Record<string, unknown>).id;
        if (typeof id !== "string" && typeof id !== "number") {
          throw new Error("Chaque message mis en cache doit avoir un identifiant.");
        }
        await transaction.runAsync(
          `INSERT INTO cached_messages (thread_key, message_id, payload, cached_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(thread_key, message_id) DO UPDATE SET
             payload = excluded.payload,
             cached_at = CURRENT_TIMESTAMP`,
          threadKey,
          String(id),
          JSON.stringify(message),
        );
      }
      await transaction.runAsync(
        `DELETE FROM cached_messages
         WHERE thread_key = ? AND message_id NOT IN (
           SELECT message_id FROM cached_messages
           WHERE thread_key = ?
           ORDER BY cached_at DESC
           LIMIT 100
         )`,
        threadKey,
        threadKey,
      );
    });
  } catch (error) {
    logCacheFailure(error);
  }
};

export const getCachedMessages = async <T>(
  threadKey: string,
): Promise<T[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ payload: string }>(
      `SELECT payload FROM cached_messages
       WHERE thread_key = ? ORDER BY cached_at ASC`,
      threadKey,
    );
    return rows.map((row) => JSON.parse(row.payload) as T);
  } catch (error) {
    logCacheFailure(error);
    return [];
  }
};

export const clearCachedMessages = async (ownerId: string): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      "DELETE FROM cached_messages WHERE thread_key LIKE ?",
      `user:${encodeURIComponent(ownerId)}:%`,
    );
  } catch (error) {
    logCacheFailure(error);
  }
};

export const getApiCache = async <T>(cacheKey: string): Promise<T | null> => {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM api_cache WHERE cache_key = ?",
      cacheKey,
    );
    return row ? (JSON.parse(row.payload) as T) : null;
  } catch (error) {
    logCacheFailure(error);
    return null;
  }
};

export const setApiCache = async (
  cacheKey: string,
  payload: unknown,
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO api_cache (cache_key, payload, cached_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload = excluded.payload,
           cached_at = CURRENT_TIMESTAMP`,
        cacheKey,
        JSON.stringify(payload),
      );
      await transaction.execAsync(`
        DELETE FROM api_cache
        WHERE cache_key NOT IN (
          SELECT cache_key FROM api_cache
          ORDER BY cached_at DESC
          LIMIT 200
        )
      `);
    });
  } catch (error) {
    logCacheFailure(error);
  }
};

export const clearApiCache = async (): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.execAsync("DELETE FROM api_cache");
  } catch (error) {
    logCacheFailure(error);
  }
};

export const enqueueOfflineAction = async (
  actionType: SyncActionType,
  ownerId: string,
  payload: Record<string, unknown>,
): Promise<number> => {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO sync_queue (owner_id, action_type, payload, status) VALUES (?, ?, ?, 'pending')",
    ownerId,
    actionType,
    JSON.stringify(payload),
  );
  return result.lastInsertRowId;
};

export const getPendingActions = async (ownerId: string): Promise<SyncAction[]> => {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: number;
    action_type: SyncActionType;
    payload: string;
    status: QueueStatus;
    created_at: string;
    attempts: number;
  }>(
    `SELECT id, action_type, payload, status, created_at, attempts
     FROM sync_queue
     WHERE owner_id = ? AND status IN ('pending', 'failed')
     ORDER BY id`,
    ownerId,
  );
  return rows.map((row) => ({
    id: row.id,
    actionType: row.action_type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status,
    createdAt: row.created_at,
    attempts: row.attempts,
  }));
};

export const updateSyncAction = async (
  id: number,
  status: QueueStatus,
): Promise<void> => {
  const database = await getDatabase();
  const result = await database.runAsync(
    `UPDATE sync_queue
     SET status = ?,
         attempts = attempts + CASE WHEN ? = 'processing' THEN 1 ELSE 0 END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    status,
    status,
    id,
  );
  if (result.changes !== 1) {
    throw new Error(`L'action hors ligne ${id} n'existe pas.`);
  }
};

export const removeSyncAction = async (id: number): Promise<void> => {
  const database = await getDatabase();
  const result = await database.runAsync("DELETE FROM sync_queue WHERE id = ?", id);
  if (result.changes !== 1) {
    throw new Error(`L'action hors ligne ${id} n'existe pas.`);
  }
};

export const getPersistedQueryClient = async <T>(): Promise<T | undefined> => {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM query_cache WHERE id = 1",
    );
    return row ? (JSON.parse(row.payload) as T) : undefined;
  } catch (error) {
    logCacheFailure(error);
    return undefined;
  }
};

export const setPersistedQueryClient = async (payload: unknown): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO query_cache (id, payload, updated_at)
       VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = CURRENT_TIMESTAMP`,
      JSON.stringify(payload),
    );
  } catch (error) {
    logCacheFailure(error);
  }
};

export const clearPersistedQueryClient = async (): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM query_cache WHERE id = 1");
  } catch (error) {
    logCacheFailure(error);
  }
};
