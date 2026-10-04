import type { PersistedClient } from "@tanstack/react-query-persist-client";
import type {
  QueueStatus,
  SyncAction,
  SyncActionType,
} from "./db";

const POST_KEY = "quartierplus.offline.cached-posts";
const ALERT_KEY = "quartierplus.offline.cached-alerts";
const MESSAGE_KEY_PREFIX = "quartierplus.offline.cached-messages.";
const ACTIONS_KEY = "quartierplus.offline.sync-queue";
const API_CACHE_PREFIX = "quartierplus.offline.api-cache.";
const QUERY_CLIENT_KEY = "quartierplus.offline.query-client";

const readJson = <T>(key: string, fallback: T): T => {
  const value = globalThis.localStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : fallback;
};

const writeJson = (key: string, value: unknown) => {
  globalThis.localStorage.setItem(key, JSON.stringify(value));
};

const cacheCollection = (key: string, entries: unknown[]) => {
  const items = readJson<unknown[]>(key, []);
  const byId = new Map<string, unknown>();
  for (const item of [...items, ...entries]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Entrée de cache locale invalide.");
    }
    const id = (item as Record<string, unknown>).id;
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error("Une entrée mise en cache doit avoir un identifiant.");
    }
    byId.set(String(id), item);
  }
  writeJson(key, [...byId.values()]);
};

export const initializeDatabase = async (): Promise<void> => {};
export const cachePosts = (posts: unknown[]) => cacheCollection(POST_KEY, posts);
export const getCachedPosts = async <T = unknown[]>(): Promise<T> =>
  readJson(POST_KEY, []) as T;
export const cacheAlerts = (alerts: unknown[]) =>
  cacheCollection(ALERT_KEY, alerts);
export const getCachedAlerts = async <T = unknown[]>(): Promise<T> =>
  readJson(ALERT_KEY, []) as T;
export const cacheMessages = async (threadKey: string, messages: unknown[]) => {
  if (!threadKey.trim()) throw new Error("La conversation à mettre en cache est invalide.");
  const key = `${MESSAGE_KEY_PREFIX}${encodeURIComponent(threadKey)}`;
  const existing = readJson<unknown[]>(key, []);
  const byId = new Map<string, unknown>();
  for (const message of [...existing, ...messages]) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error("Un message à mettre en cache est invalide.");
    }
    const id = (message as Record<string, unknown>).id;
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error("Chaque message mis en cache doit avoir un identifiant.");
    }
    byId.set(String(id), message);
  }
  writeJson(key, [...byId.values()].slice(-100));
};
export const getCachedMessages = async <T>(threadKey: string): Promise<T[]> =>
  readJson<T[]>(
    `${MESSAGE_KEY_PREFIX}${encodeURIComponent(threadKey)}`,
    [],
  );
export const clearCachedMessages = async (ownerId: string) => {
  const ownerPrefix = `${MESSAGE_KEY_PREFIX}${encodeURIComponent(
    `user:${encodeURIComponent(ownerId)}:`,
  )}`;
  const keys: string[] = [];
  for (let index = 0; index < globalThis.localStorage.length; index += 1) {
    const key = globalThis.localStorage.key(index);
    if (key?.startsWith(ownerPrefix)) keys.push(key);
  }
  keys.forEach((key) => globalThis.localStorage.removeItem(key));
};
export const getApiCache = async <T>(cacheKey: string): Promise<T | null> =>
  readJson<T | null>(`${API_CACHE_PREFIX}${encodeURIComponent(cacheKey)}`, null);
export const setApiCache = async (cacheKey: string, payload: unknown) => {
  writeJson(`${API_CACHE_PREFIX}${encodeURIComponent(cacheKey)}`, payload);
};
export const clearApiCache = async () => {
  const keys: string[] = [];
  for (let index = 0; index < globalThis.localStorage.length; index += 1) {
    const key = globalThis.localStorage.key(index);
    if (key?.startsWith(API_CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => globalThis.localStorage.removeItem(key));
};
export const enqueueOfflineAction = async (
  actionType: SyncActionType,
  _ownerId: string,
  payload: Record<string, unknown>,
) => {
  const actions = readJson<SyncAction[]>(ACTIONS_KEY, []);
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  actions.push({
    id,
    actionType,
    payload,
    status: "pending",
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  writeJson(ACTIONS_KEY, actions);
  return id;
};
export const getPendingActions = async (_ownerId: string) =>
  readJson<SyncAction[]>(ACTIONS_KEY, []).filter(
    (action) => action.status === "pending" || action.status === "failed",
  );
export const updateSyncAction = async (id: number, status: QueueStatus) => {
  const actions = readJson<SyncAction[]>(ACTIONS_KEY, []);
  const action = actions.find((entry) => entry.id === id);
  if (!action) throw new Error(`L'action hors ligne ${id} n'existe pas.`);
  action.status = status;
  if (status === "processing") action.attempts += 1;
  writeJson(ACTIONS_KEY, actions);
};
export const removeSyncAction = async (id: number) => {
  const actions = readJson<SyncAction[]>(ACTIONS_KEY, []);
  const remaining = actions.filter((entry) => entry.id !== id);
  if (remaining.length === actions.length) {
    throw new Error(`L'action hors ligne ${id} n'existe pas.`);
  }
  writeJson(ACTIONS_KEY, remaining);
};
export const getPersistedQueryClient = async () =>
  readJson<PersistedClient | undefined>(QUERY_CLIENT_KEY, undefined);
export const setPersistedQueryClient = async (payload: unknown) =>
  writeJson(QUERY_CLIENT_KEY, payload);
export const clearPersistedQueryClient = async () =>
  globalThis.localStorage.removeItem(QUERY_CLIENT_KEY);
