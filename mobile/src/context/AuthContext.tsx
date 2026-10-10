import NetInfo from "@react-native-community/netinfo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import api, {
  clearStoredAuthToken,
  getStoredAuthToken,
  storeAuthToken,
  subscribeToNetwork,
} from "../services/api";
import {
  clearApiCache,
  clearCachedMessages,
  clearPersistedQueryClient,
  enqueueOfflineAction,
  getPendingActions,
  removeSyncAction,
  updateSyncAction,
  type SyncActionType,
  type SyncAction,
} from "../services/db";
import { queryClient } from "../services/queryClient";
import {
  registerPushNotifications,
  unregisterPushNotifications,
} from "../services/notifications";

export type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  role?: string | null;
  country_code?: string | null;
  reputation_score?: number | null;
  is_verified?: boolean;
  [key: string]: unknown;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  authStatus: "loading" | "guest" | "connected";
  authPromptVisible: boolean;
  requestAuthentication: () => void;
  dismissAuthPrompt: () => void;
  isOffline: boolean;
  isSessionLoading: boolean;
  authError: string | null;
  setSession: (token: string, user: AuthUser) => Promise<void>;
  queueOfflineAction: (
    actionType: SyncActionType,
    payload: Record<string, unknown>,
  ) => Promise<number>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readUser = (value: unknown): AuthUser | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  const candidate =
    envelope.user && typeof envelope.user === "object"
      ? envelope.user
      : envelope;
  const user = candidate as Record<string, unknown>;
  return typeof user.id === "string" ? (user as AuthUser) : null;
};

const actionEndpoint = (action: SyncAction) => {
  if (action.actionType === "create_post") return "/v1/marketplace/items";
  if (action.actionType === "trigger_sos") return "/v1/sos";
  throw new Error(`Type d'action hors ligne non pris en charge: ${action.actionType}`);
};

const buildQueuedRequestBody = (action: SyncAction): FormData => {
  const formData = new FormData();
  const appendFile = (field: string, uri: unknown, filename: string, type: string) => {
    if (typeof uri !== "string" || !uri) return;
    const file = { uri, name: filename, type };
    const nativeFormData = formData as FormData & {
      append: (name: string, value: string | typeof file) => void;
    };
    nativeFormData.append(field, file);
  };

  if (action.actionType === "create_post") {
    for (const [key, value] of Object.entries(action.payload)) {
      if (key === "image_uri" || value === undefined || value === null) continue;
      formData.append(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    }
    appendFile(
      "image",
      action.payload.image_uri,
      `marketplace-offline-${action.id}.webp`,
      "image/webp",
    );
    return formData;
  }

  for (const key of ["latitude", "longitude", "emergency_type"]) {
    const value = action.payload[key];
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }
  appendFile(
    "emergency_image",
    action.payload.emergency_image_uri,
    `sos-offline-${action.id}.jpg`,
    "image/jpeg",
  );
  appendFile(
    "ambient_audio",
    action.payload.ambient_audio_uri,
    `sos-offline-${action.id}.m4a`,
    "audio/m4a",
  );
  return formData;
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const networkWasOnline = useRef(false);
  const isSyncingQueue = useRef(false);
  const pushTokenRef = useRef<string | null>(null);

  const refreshUser = useCallback(async () => {
    const storedToken = await getStoredAuthToken();
    if (!storedToken) {
      setUser(null);
      return;
    }
    const response = await api.get("/v1/users/me");
    const currentUser = readUser(response.data);
    if (!currentUser) {
      throw new Error("La réponse utilisateur de l'API est invalide.");
    }
    setUser(currentUser);
    setToken(storedToken);
    setAuthError(null);
  }, []);

  const syncQueuedActions = useCallback(async () => {
    if (!user?.id || isOffline || isSyncingQueue.current) return;
    isSyncingQueue.current = true;
    try {
      const actions = await getPendingActions(user.id);
      for (const action of actions) {
        await updateSyncAction(action.id, "processing");
        try {
          await api.post(
            actionEndpoint(action),
            buildQueuedRequestBody(action),
          );
          await removeSyncAction(action.id);
        } catch (error) {
          await updateSyncAction(action.id, "failed");
          console.error(`Offline action ${action.id} could not be synchronized:`, error);
          break;
        }
      }
    } finally {
      isSyncingQueue.current = false;
    }
  }, [isOffline, user?.id]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToNetwork((online) => {
      if (!mounted) return;
      const reconnected = online && !networkWasOnline.current;
      networkWasOnline.current = online;
      setIsOffline(!online);
      if (reconnected) {
        void refreshUser().catch((error: unknown) => {
          if (!mounted) return;
          setAuthError(
            error instanceof Error
              ? error.message
              : "Impossible d'actualiser le profil utilisateur.",
          );
        });
        void syncQueuedActions();
      }
    });
    void NetInfo.fetch().then((state) => {
      if (!mounted) return;
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      networkWasOnline.current = online;
      setIsOffline(!online);
    });

    void (async () => {
      try {
        const storedToken = await getStoredAuthToken();
        if (!mounted) return;
        if (storedToken) {
          setToken(storedToken);
          await refreshUser();
        }
      } catch (error) {
        if (!mounted) return;
        setAuthError(
          error instanceof Error
            ? error.message
            : "Impossible de restaurer la session.",
        );
      } finally {
        if (mounted) setIsSessionLoading(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshUser, syncQueuedActions]);

  const setSession = useCallback(async (newToken: string, newUser: AuthUser) => {
    if (!newToken.trim() || !newUser.id) {
      throw new Error("Jeton ou profil de session invalide.");
    }
    await clearApiCache();
    await queryClient.cancelQueries();
    queryClient.clear();
    await clearPersistedQueryClient();
    await storeAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
    setAuthError(null);
    setIsSessionLoading(false);
  }, []);

  const requestAuthentication = useCallback(() => {
    setAuthPromptVisible(true);
  }, []);
  const dismissAuthPrompt = useCallback(() => {
    setAuthPromptVisible(false);
  }, []);

  const queueOfflineAction = useCallback(
    async (actionType: SyncActionType, payload: Record<string, unknown>) => {
      if (!user?.id) {
        throw new Error("Connectez-vous pour enregistrer une action hors ligne.");
      }
      return enqueueOfflineAction(actionType, user.id, payload);
    },
    [user?.id],
  );

  const signOut = useCallback(async () => {
    const currentUserId = user?.id;
    if (pushTokenRef.current) {
      try {
        await unregisterPushNotifications(pushTokenRef.current);
      } catch (error) {
        console.error("Unable to unregister push notifications on sign out:", error);
      }
      pushTokenRef.current = null;
    }
    await clearStoredAuthToken();
    await clearApiCache();
    if (currentUserId) await clearCachedMessages(currentUserId);
    await queryClient.cancelQueries();
    queryClient.clear();
    await clearPersistedQueryClient();
    setToken(null);
    setUser(null);
    setAuthError(null);
  }, [user?.id]);

  useEffect(() => {
    void syncQueuedActions();
  }, [syncQueuedActions]);

  useEffect(() => {
    if (!user?.id || !token || isOffline) return;
    let active = true;
    void registerPushNotifications(user.id)
      .then((pushToken) => {
        if (active) pushTokenRef.current = pushToken;
      })
      .catch((error: unknown) => {
        if (active) {
          console.error("Unable to register push notifications:", error);
        }
      });
    return () => {
      active = false;
    };
  }, [isOffline, token, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      authStatus: isSessionLoading ? "loading" : user ? "connected" : "guest",
      authPromptVisible,
      requestAuthentication,
      dismissAuthPrompt,
      isOffline,
      isSessionLoading,
      authError,
      setSession,
      queueOfflineAction,
      refreshUser,
      signOut,
    }),
    [
      user,
      token,
      isSessionLoading,
      authPromptVisible,
      requestAuthentication,
      dismissAuthPrompt,
      isOffline,
      isSessionLoading,
      authError,
      setSession,
      queueOfflineAction,
      refreshUser,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return context;
};
