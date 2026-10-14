import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  cacheAlerts,
  cachePosts,
  getApiCache,
  setApiCache,
} from "./db";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
export const API_TIMEOUT_MS = 60_000;
export const SESSION_TOKEN_KEY = "quartierplus.session.token";

type CachedRequestConfig = InternalAxiosRequestConfig & {
  __offlineCacheKey?: string;
  __servedFromOfflineCache?: boolean;
};

const isStateOnline = (state: NetInfoState) =>
  state.isConnected === true && state.isInternetReachable !== false;

let isOnline: boolean | null = null;
NetInfo.addEventListener((state) => {
  isOnline = isStateOnline(state);
});

export const getNetworkStatus = async () => {
  if (isOnline !== null) return isOnline;
  const state = await NetInfo.fetch();
  isOnline = isStateOnline(state);
  return isOnline;
};
export const subscribeToNetwork = (listener: (online: boolean) => void) =>
  NetInfo.addEventListener((state) => {
    isOnline = isStateOnline(state);
    listener(isOnline);
  });
export const getStoredAuthToken = async () =>
  globalThis.localStorage.getItem(SESSION_TOKEN_KEY);
export const storeAuthToken = async (token: string) =>
  globalThis.localStorage.setItem(SESSION_TOKEN_KEY, token);
export const clearStoredAuthToken = async () =>
  globalThis.localStorage.removeItem(SESSION_TOKEN_KEY);

const sortedParams = (params: unknown) =>
  params && typeof params === "object"
    ? JSON.stringify(
        Object.entries(params as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      )
    : "";
const getCacheKey = (config: AxiosRequestConfig) =>
  `${config.baseURL ?? ""}${config.url ?? ""}?${sortedParams(config.params)}`;
const responseFromCache = async (config: CachedRequestConfig) => {
  const data = await getApiCache<unknown>(
    config.__offlineCacheKey ?? getCacheKey(config),
  );
  if (data === null) return null;
  config.__servedFromOfflineCache = true;
  return {
    data,
    status: 200,
    statusText: "OK (offline cache)",
    headers: new AxiosHeaders({ "x-quartierplus-cache": "offline" }),
    config,
  };
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { Accept: "application/json" },
});
api.interceptors.request.use(async (config: CachedRequestConfig) => {
  const token = await getStoredAuthToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  if (config.method?.toLowerCase() === "get") {
    const skipOfflineCache =
      String(config.headers.get("Cache-Control") ?? "").toLowerCase() ===
      "no-cache";
    if (!(await getNetworkStatus())) {
      const cached = skipOfflineCache ? null : await responseFromCache(config);
      if (cached) {
        config.adapter = async () => cached;
        return config;
      }
      throw new AxiosError(
        "Aucune connexion réseau et aucune copie hors ligne de cette ressource.",
        AxiosError.ERR_NETWORK,
        config,
      );
    }
    if (!skipOfflineCache) config.__offlineCacheKey = getCacheKey(config);
  }
  return config;
});
api.interceptors.response.use(
  async (response) => {
    const config = response.config as CachedRequestConfig;
    if (
      config.method?.toLowerCase() === "get" &&
      String(config.headers.get("Cache-Control") ?? "").toLowerCase() !==
        "no-cache" &&
      !config.__servedFromOfflineCache
    ) {
      try {
        await setApiCache(config.__offlineCacheKey ?? getCacheKey(config), response.data);
        const path = config.url?.split("?")[0] ?? "";
        const records = Array.isArray(response.data)
          ? response.data
          : response.data &&
              typeof response.data === "object" &&
              !Array.isArray(response.data)
            ? Object.values(response.data as Record<string, unknown>).find(
                Array.isArray,
              )
            : null;
        if (Array.isArray(records) && path.includes("/marketplace/items")) {
          await cachePosts(records);
        } else if (
          Array.isArray(records) &&
          (path.endsWith("/sos") || path.includes("/sos/alerts"))
        ) {
          await cacheAlerts(records);
        }
      } catch (error) {
        console.error("Unable to persist API response for offline use:", error);
      }
    }
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    const config = error.config as CachedRequestConfig | undefined;
    if (
      config?.method?.toLowerCase() === "get" &&
      String(config.headers?.get("Cache-Control") ?? "").toLowerCase() !==
        "no-cache" &&
      !error.response &&
      !config.__servedFromOfflineCache
    ) {
      const cached = await responseFromCache(config);
      if (cached) return cached;
    }
    throw error;
  },
);

export default api;

export type ApiFetchResponse = {
  ok: boolean;
  status: number;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
};
export const apiFetch = async (
  input: string,
  init: RequestInit = {},
): Promise<ApiFetchResponse> => {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (
    typeof body === "string" &&
    headers.get("Content-Type")?.includes("application/json")
  ) {
    try {
      body = JSON.parse(body) as BodyInit;
    } catch {
      throw new Error("Le corps JSON de la requête est invalide.");
    }
  }
  try {
    const response = await api.request({
      url: input,
      method: (init.method ?? "GET").toUpperCase(),
      headers: Object.fromEntries(headers.entries()),
      data: body,
      signal: init.signal ?? undefined,
    });
    const data = response.data;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      async json<T>() {
        return data as T;
      },
      async text() {
        return typeof data === "string" ? data : JSON.stringify(data);
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const data: unknown = error.response.data;
      return {
        ok: false,
        status: error.response.status,
        async json<T>() {
          return data as T;
        },
        async text() {
          return typeof data === "string" ? data : JSON.stringify(data);
        },
      };
    }
    throw error;
  }
};
export const API_URL = API_BASE_URL;
