import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";
import type { PropsWithChildren } from "react";
import {
  focusManager,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import {
  clearPersistedQueryClient,
  getPersistedQueryClient,
  setPersistedQueryClient,
} from "./db";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "online",
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: "online",
      retry: 0,
    },
  },
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  }),
);

focusManager.setEventListener((setFocused) => {
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () =>
      setFocused(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange, false);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  const subscription = AppState.addEventListener("change", (state) => {
    setFocused(state === "active");
  });
  return () => subscription.remove();
});

const persister = {
  persistClient: (client: PersistedClient) =>
    setPersistedQueryClient(client),
  restoreClient: () => getPersistedQueryClient<PersistedClient>(),
  removeClient: () => clearPersistedQueryClient(),
};

export const QUERY_CACHE_BUSTER = "quartierplus-query-cache-v1";
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export function OfflineQueryProvider({
  children,
}: PropsWithChildren) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: QUERY_CACHE_BUSTER,
        maxAge: QUERY_CACHE_MAX_AGE,
      }}
      onError={() => {
        console.error("Unable to restore the offline query cache.");
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
