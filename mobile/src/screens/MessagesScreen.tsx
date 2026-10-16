import { AudioSession } from "@livekit/react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  AlertTriangle,
  ImagePlus,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  Radio,
  Send,
  Siren,
  X,
} from "lucide-react-native";
import { Room } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import VoiceTextInput from "../components/VoiceTextInput";
import type { MainTabParamList } from "../navigation/types";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import { cacheMessages, getCachedMessages } from "../services/db";
import {
  API_BASE_URL,
  apiFetch,
  getStoredAuthToken,
} from "../services/api";

type ChannelId = "emergency" | "announcements";
type Channel = {
  id: ChannelId;
  label: string;
  description: string;
  color: string;
  background: string;
  icon: typeof Siren;
};
type ChatMessage = {
  id: string;
  channelId?: ChannelId;
  conversationId?: string;
  text: string;
  senderName: string;
  createdAt: string;
  isOwnMessage: boolean;
  imageUrl?: string;
};
type PrivateConversation = {
  id: string;
  participantId: string;
  participantName: string;
  participantType: "neighbor" | "seller";
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
};

const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL;
const CHANNELS: Channel[] = [
  {
    id: "emergency",
    label: "URGENCES",
    description: "Canal prioritaire · Talkie-walkie",
    color: "#dc2626",
    background: "#fef2f2",
    icon: Siren,
  },
  {
    id: "announcements",
    label: "ANNONCES",
    description: "Informations officielles du quartier",
    color: "#ca8a04",
    background: "#fefce8",
    icon: Megaphone,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeMessage = (
  value: unknown,
  channelId?: ChannelId,
  conversationId?: string,
): ChatMessage | null => {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? value.message_id ?? "");
  const rawChannel = value.channel_id ?? value.channelId;
  const messageChannel = rawChannel == null ? channelId : String(rawChannel);
  const rawConversation = value.conversation_id ?? value.conversationId;
  const messageConversation =
    rawConversation == null ? conversationId : String(rawConversation);
  if (
    !id ||
    (channelId && messageChannel !== channelId) ||
    (conversationId && messageConversation !== conversationId) ||
    (!channelId && !conversationId)
  ) {
    return null;
  }
  const sender = isRecord(value.sender) ? value.sender : null;
  return {
    id,
    channelId,
    conversationId,
    text: String(value.content ?? value.text ?? ""),
    senderName: String(
      sender?.name ?? value.sender_name ?? value.username ?? "Voisin",
    ),
    createdAt: String(
      value.created_at ?? value.createdAt ?? new Date().toISOString(),
    ),
    isOwnMessage: value.is_mine === true || value.isOwnMessage === true,
    imageUrl:
      typeof value.image_url === "string"
        ? value.image_url
        : typeof value.imageUrl === "string"
          ? value.imageUrl
          : undefined,
  };
};

const normalizeConversation = (value: unknown): PrivateConversation | null => {
  if (!isRecord(value)) return null;
  const participant = isRecord(value.participant)
    ? value.participant
    : isRecord(value.other_user)
      ? value.other_user
      : isRecord(value.counterpart)
        ? value.counterpart
        : null;
  const id = String(value.id ?? value.conversation_id ?? "");
  const participantId = String(
    participant?.id ??
      value.participant_id ??
      value.other_user_id ??
      value.counterpart_id ??
      "",
  );
  const participantName = String(
    participant?.name ??
      value.participant_name ??
      value.other_user_name ??
      value.counterpart_name ??
      "",
  );
  const rawType = String(
    participant?.type ??
    participant?.role ??
    value.participant_type ??
    value.counterpart_type ??
    value.user_type ??
    (participant?.is_seller === true || value.is_seller === true
      ? "seller"
      : "neighbor"),
  ).toLowerCase();
  const lastMessage = isRecord(value.last_message)
    ? value.last_message.content ?? value.last_message.text ?? ""
    : value.last_message ?? value.lastMessage ?? "";
  if (!id || !participantId || !participantName) return null;
  return {
    id,
    participantId,
    participantName,
    participantType: ["seller", "merchant", "vendor", "commercant"].includes(
      rawType,
    )
      ? "seller"
      : "neighbor",
    lastMessage: String(lastMessage),
    updatedAt: String(
      value.updated_at ?? value.updatedAt ?? new Date().toISOString(),
    ),
    unreadCount: Math.max(
      0,
      Number(value.unread_count ?? value.unreadCount ?? 0) || 0,
    ),
  };
};

export default function MessagesScreen() {
  const route = useRoute<RouteProp<MainTabParamList, "Messages">>();
  const { isOffline, requestAuthentication, token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"Privés" | "Canaux">("Privés");
  const [selectedChannelId, setSelectedChannelId] =
    useState<ChannelId>("emergency");
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedConversation, setSelectedConversation] =
    useState<PrivateConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isPttVisible, setIsPttVisible] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isConnectingToLiveKit, setIsConnectingToLiveKit] = useState(false);
  const [liveKitConnected, setLiveKitConnected] = useState(false);
  const [pttError, setPttError] = useState<string | null>(null);

  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitConnectPromiseRef = useRef<Promise<Room> | null>(null);
  const liveKitTokenControllerRef = useRef<AbortController | null>(null);
  const pttPressedRef = useRef(false);
  const selectedChannel =
    CHANNELS.find((channel) => channel.id === selectedChannelId) ?? CHANNELS[0];
  const filteredConversations = useMemo(() => {
    const normalize = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
    const query = normalize(conversationSearch.trim());
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      normalize(
        `${conversation.participantName} ${conversation.lastMessage}`,
      ).includes(query),
    );
  }, [conversationSearch, conversations]);

  useEffect(() => {
    const params = route.params;
    if (!params?.voiceRequestId) return;
    if (params.voiceChannelId) {
      setActiveTab("Canaux");
      setSelectedChannelId(params.voiceChannelId);
      setSelectedConversation(null);
      setConversationSearch("");
      return;
    }
    setActiveTab("Privés");
    setSelectedConversation(null);
    setConversationSearch(params.voiceContactQuery ?? "");
  }, [route.params]);

  useEffect(() => {
    if (activeTab !== "Privés") return;
    if (!API_BASE_URL) {
      setConversationsError(
        "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
      );
      setIsLoadingConversations(false);
      return;
    }
    const controller = new AbortController();
    const loadConversations = async () => {
      setIsLoadingConversations(true);
      setConversationsError(null);
      try {
        const response = await apiFetch(`${API_BASE_URL}/v1/conversations`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Chargement refusé (HTTP ${response.status}).`);
        }
        const payload: unknown = await response.json();
        const rawConversations = Array.isArray(payload)
          ? payload
          : isRecord(payload) && Array.isArray(payload.conversations)
            ? payload.conversations
            : null;
        if (!rawConversations) {
          throw new Error("Le serveur a renvoyé une liste de conversations invalide.");
        }
        const normalized = rawConversations.map(normalizeConversation);
        if (normalized.some((conversation) => conversation === null)) {
          throw new Error("La liste contient une conversation invalide.");
        }
        setConversations(
          normalized.filter(
            (conversation): conversation is PrivateConversation =>
              conversation !== null,
          ),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setConversationsError(
          error instanceof Error
            ? error.message
            : "Impossible de charger les conversations privées.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoadingConversations(false);
      }
    };
    void loadConversations();
    return () => controller.abort();
  }, [activeTab, isOffline]);

  useEffect(() => {
    if (activeTab === "Privés") {
      if (!selectedConversation) {
        setMessages([]);
        setIsLoadingMessages(false);
        setMessagesError(null);
        return;
      }
      if (!API_BASE_URL) {
        setMessagesError(
          "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
        );
        setIsLoadingMessages(false);
        return;
      }
      const controller = new AbortController();
      const loadPrivateMessages = async () => {
        setIsLoadingMessages(true);
        setMessages([]);
        setMessagesError(null);
        try {
          const response = await apiFetch(
            `${API_BASE_URL}/v1/conversations/${encodeURIComponent(selectedConversation.id)}/messages`,
            { signal: controller.signal },
          );
          if (!response.ok) {
            throw new Error(`Chargement refusé (HTTP ${response.status}).`);
          }
          const payload: unknown = await response.json();
          const rawMessages = Array.isArray(payload)
            ? payload
            : isRecord(payload) && Array.isArray(payload.messages)
              ? payload.messages
              : null;
          if (!rawMessages) {
            throw new Error("Le serveur a renvoyé une liste de messages invalide.");
          }
          const normalized = rawMessages.map((message) =>
            normalizeMessage(message, undefined, selectedConversation.id),
          );
          if (normalized.some((message) => message === null)) {
            throw new Error("La liste contient un message invalide.");
          }
          const validMessages = normalized.filter(
            (message): message is ChatMessage => message !== null,
          );
          setMessages(validMessages);
          await cacheMessages(
            `user:${encodeURIComponent(user?.id ?? "anonymous")}:conversation:${selectedConversation.id}`,
            validMessages,
          ).catch((cacheError: unknown) => {
            console.error("Unable to persist loaded private messages:", cacheError);
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          try {
            const cachedMessages = await getCachedMessages<ChatMessage>(
              `user:${encodeURIComponent(user?.id ?? "anonymous")}:conversation:${selectedConversation.id}`,
            );
            setMessages(cachedMessages);
            setMessagesError(
              cachedMessages.length
                ? "Affichage des derniers messages enregistrés hors ligne."
                : error instanceof Error
                  ? error.message
                  : "Impossible de charger cette discussion privée.",
            );
          } catch (cacheError) {
            console.error("Unable to load private-message cache:", cacheError);
            setMessagesError(
              error instanceof Error
                ? error.message
                : "Impossible de charger cette discussion privée.",
            );
          }
        } finally {
          if (!controller.signal.aborted) setIsLoadingMessages(false);
        }
      };
      void loadPrivateMessages();
      return () => controller.abort();
    }

    if (!API_BASE_URL) {
      setMessagesError(
        "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
      );
      setIsLoadingMessages(false);
      return;
    }

    const controller = new AbortController();
    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setMessagesError(null);
      setMessages([]);
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/v1/channels/${encodeURIComponent(selectedChannelId)}/messages`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Chargement refusé (HTTP ${response.status}).`);
        }
        const payload: unknown = await response.json();
        const rawMessages = Array.isArray(payload)
          ? payload
          : isRecord(payload) && Array.isArray(payload.messages)
            ? payload.messages
            : null;
        if (!rawMessages) {
          throw new Error("Le serveur a renvoyé une liste de messages invalide.");
        }
        const normalizedMessages = rawMessages.map((message) =>
          normalizeMessage(message, selectedChannelId),
        );
        if (normalizedMessages.some((message) => message === null)) {
          throw new Error("La liste contient un message invalide.");
        }
        const validMessages = normalizedMessages.filter(
          (message): message is ChatMessage => message !== null,
        );
        setMessages((current) => {
          const byId = new Map(validMessages.map((message) => [message.id, message]));
          current.forEach((message) => byId.set(message.id, message));
          return [...byId.values()];
        });
        await cacheMessages(
          `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`,
          validMessages,
        ).catch((cacheError: unknown) => {
          console.error("Unable to persist loaded channel messages:", cacheError);
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        try {
          const cachedMessages = await getCachedMessages<ChatMessage>(
            `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`,
          );
          setMessages(cachedMessages);
          setMessagesError(
            cachedMessages.length
              ? "Affichage des derniers messages enregistrés hors ligne."
              : error instanceof Error
                ? error.message
                : "Impossible de charger les messages du canal.",
          );
        } catch (cacheError) {
          console.error("Unable to load channel-message cache:", cacheError);
          setMessagesError(
            error instanceof Error
              ? error.message
              : "Impossible de charger les messages du canal.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingMessages(false);
      }
    };

    void loadMessages();
    return () => controller.abort();
  }, [activeTab, isOffline, selectedChannelId, selectedConversation, user?.id]);

  useEffect(() => {
    if (!API_BASE_URL) return;
    const isPrivateConversation =
      activeTab === "Privés" && selectedConversation !== null;
    if (activeTab === "Privés" && !selectedConversation) return;
    let socket: ReturnType<typeof io> | null = null;
    let cancelled = false;
    void (async () => {
      const storedToken = await getStoredAuthToken();
      if (cancelled) return;
      const authToken = token ?? storedToken;
      if (!authToken) return;
      socket = io(API_BASE_URL, {
        auth: { token: authToken },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 10_000,
      });
      const activeSocket = socket;
      activeSocket.on("connect", () => {
        if (isPrivateConversation && selectedConversation) {
          activeSocket.emit("join_conversation", {
            conversation_id: selectedConversation.id,
          });
        } else {
          activeSocket.emit("join_channel", { channel_id: selectedChannelId });
        }
      });
      activeSocket.on("new_message", (payload: unknown) => {
        if (!isRecord(payload)) return;
        const message =
          isPrivateConversation && selectedConversation
            ? normalizeMessage(payload, undefined, selectedConversation.id)
            : String(payload.channel_id ?? payload.channelId ?? "") ===
                selectedChannelId
              ? normalizeMessage(payload, selectedChannelId)
              : null;
        if (!message) return;
        const threadKey =
          isPrivateConversation && selectedConversation
            ? `user:${encodeURIComponent(user?.id ?? "anonymous")}:conversation:${selectedConversation.id}`
            : `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`;
        setMessages((current) => [
          ...current.filter((item) => item.id !== message.id),
          message,
        ]);
        void cacheMessages(threadKey, [message]).catch((error: unknown) => {
          console.error("Unable to cache a received chat message:", error);
        });
      });
      activeSocket.on("channel:new_message", (payload: unknown) => {
        if (isPrivateConversation || !isRecord(payload)) return;
        if (
          String(payload.channel_name ?? "").toUpperCase() !==
          selectedChannel.label
        ) {
          return;
        }
        const message = normalizeMessage(
          { ...payload, channel_id: selectedChannelId },
          selectedChannelId,
        );
        if (!message) return;
        setMessages((current) => [
          ...current.filter((item) => item.id !== message.id),
          message,
        ]);
        void cacheMessages(
          `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`,
          [message],
        ).catch(
          (error: unknown) => {
            console.error("Unable to cache a channel:new_message event:", error);
          },
        );
      });
      activeSocket.on("chat:message", (payload: unknown) => {
        if (!isRecord(payload)) return;
        const message =
          isPrivateConversation && selectedConversation
            ? normalizeMessage(payload, undefined, selectedConversation.id)
            : isRecord(payload) &&
                String(payload.channel_name ?? "").toUpperCase() === selectedChannel.label
              ? normalizeMessage(
                  { ...payload, channel_id: selectedChannelId },
                  selectedChannelId,
                )
              : normalizeMessage(payload, selectedChannelId);
        if (!message) return;
        const threadKey =
          isPrivateConversation && selectedConversation
            ? `user:${encodeURIComponent(user?.id ?? "anonymous")}:conversation:${selectedConversation.id}`
            : `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`;
        setMessages((current) => [
          ...current.filter((item) => item.id !== message.id),
          message,
        ]);
        void cacheMessages(threadKey, [message]).catch((error: unknown) => {
          console.error("Unable to cache a chat:message event:", error);
        });
      });
    })().catch((error: unknown) => {
      console.error("Unable to initialize the authenticated messages socket:", error);
    });

    return () => {
      cancelled = true;
      if (socket) {
        if (isPrivateConversation && selectedConversation) {
          socket.emit("leave_conversation", {
            conversation_id: selectedConversation.id,
          });
        } else {
          socket.emit("leave_channel", { channel_id: selectedChannelId });
        }
        socket.removeAllListeners("connect");
        socket.removeAllListeners("new_message");
        socket.removeAllListeners("channel:new_message");
        socket.removeAllListeners("chat:message");
        socket.disconnect();
      }
    };
  }, [activeTab, selectedChannelId, selectedConversation, token, user?.id]);

  useEffect(
    () => () => {
      const room = liveKitRoomRef.current;
      if (room) void room.disconnect();
      liveKitRoomRef.current = null;
      void AudioSession.stopAudioSession().catch(() => undefined);
    },
    [],
  );

  const upsertMessage = (message: ChatMessage) => {
    setMessages((current) => [
      ...current.filter((item) => item.id !== message.id),
      message,
    ]);
    const threadKey =
      activeTab === "Privés" && selectedConversation
        ? `user:${encodeURIComponent(user?.id ?? "anonymous")}:conversation:${selectedConversation.id}`
        : `user:${encodeURIComponent(user?.id ?? "anonymous")}:channel:${selectedChannelId}`;
    void cacheMessages(threadKey, [message]).catch((error: unknown) => {
      console.error("Unable to cache a sent chat message:", error);
    });
  };

  const sendMessage = async (imageUri?: string) => {
    const text = draftMessage.trim();
    if (!text && !imageUri) {
      Alert.alert("Message vide", "Saisissez un message ou joignez une photo.");
      return;
    }
    if (!user?.id || !token) {
      requestAuthentication();
      return;
    }
    if (!API_BASE_URL) {
      Alert.alert(
        "Envoi indisponible",
        "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
      );
      return;
    }
    setIsSending(true);
    try {
      if (activeTab === "Privés" && !selectedConversation) {
        throw new Error("Ouvrez une conversation avant d'envoyer un message.");
      }
      const url =
        activeTab === "Privés" && selectedConversation
          ? `${API_BASE_URL}/v1/conversations/${encodeURIComponent(selectedConversation.id)}/messages`
          : `${API_BASE_URL}/v1/channels/${encodeURIComponent(selectedChannelId)}/messages`;
      let body: FormData | string;
      let headers: Record<string, string> | undefined;
      if (imageUri) {
        const formData = new FormData();
        formData.append("content", text);
        const file = {
          uri: imageUri,
          name: `message-${Date.now()}.webp`,
          type: "image/webp",
        };
        const nativeFormData = formData as FormData & {
          append: (key: string, value: string | typeof file) => void;
        };
        nativeFormData.append("image", file);
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({ content: text });
      }
      const response = await apiFetch(url, { method: "POST", headers, body });
      if (!response.ok) {
        throw new Error(`L'envoi a échoué (HTTP ${response.status}).`);
      }
      const payload: unknown = await response.json();
      const rawMessage =
        isRecord(payload) && "message" in payload ? payload.message : payload;
      const message =
        activeTab === "Privés" && selectedConversation
          ? normalizeMessage(rawMessage, undefined, selectedConversation.id)
          : normalizeMessage(rawMessage, selectedChannelId);
      if (!message) {
        throw new Error("Le serveur n'a pas renvoyé le message créé.");
      }
      upsertMessage(message);
      if (activeTab === "Privés" && selectedConversation) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === selectedConversation.id
              ? {
                  ...conversation,
                  lastMessage: text || "Photo",
                  updatedAt: message.createdAt,
                }
              : conversation,
          ),
        );
      }
      setDraftMessage("");
    } catch (error) {
      Alert.alert(
        "Envoi impossible",
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const pickAndSendPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          "L'accès à la photothèque est nécessaire pour joindre une photo.",
        );
      }
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset?.uri) throw new Error("La photo sélectionnée est indisponible.");
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.WEBP },
      );
      if (!compressed.uri) throw new Error("La compression WebP a échoué.");
      await sendMessage(compressed.uri);
    } catch (error) {
      Alert.alert(
        "Impossible de joindre la photo",
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    }
  };

  const submitReport = async () => {
    if (!selectedReport) return;
    if (!API_BASE_URL) {
      Alert.alert(
        "Signalement indisponible",
        "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
      );
      return;
    }
    if (reportReason.trim().length < 3) {
      Alert.alert("Motif requis", "Précisez le motif du signalement.");
      return;
    }
    setIsSubmittingReport(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "message",
          target_id: selectedReport.id,
          reason: reportReason.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Le signalement a échoué (HTTP ${response.status}).`);
      }
      setSelectedReport(null);
      setReportReason("");
      Alert.alert(
        "Signalement transmis",
        "Le message a été transmis à la modération.",
      );
    } catch (error) {
      Alert.alert(
        "Signalement impossible",
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const ensureLiveKitRoom = async (): Promise<Room> => {
    if (liveKitRoomRef.current) return liveKitRoomRef.current;
    if (liveKitConnectPromiseRef.current) return liveKitConnectPromiseRef.current;
    if (!API_BASE_URL) {
      throw new Error("L'adresse du serveur n'est pas configurée.");
    }

    const connectRoom = async () => {
      setIsConnectingToLiveKit(true);
      setPttError(null);
      const controller = new AbortController();
      liveKitTokenControllerRef.current = controller;
      try {
        const response = await apiFetch(`${API_BASE_URL}/v1/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: selectedChannelId }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Jeton LiveKit indisponible (HTTP ${response.status}).`);
        }
        const payload: unknown = await response.json();
        const token =
          isRecord(payload) && typeof payload.token === "string"
            ? payload.token
            : "";
        const serverUrl =
          isRecord(payload) && typeof payload.url === "string"
            ? payload.url
            : LIVEKIT_URL;
        if (!token || !serverUrl) {
          throw new Error(
            "La réponse doit contenir un jeton et une URL LiveKit.",
          );
        }
        await AudioSession.startAudioSession();
        if (controller.signal.aborted) {
          await AudioSession.stopAudioSession();
          throw new Error("Connexion au talkie-walkie annulée.");
        }
        const room = new Room();
        await room.connect(serverUrl, token);
        if (controller.signal.aborted) {
          await room.disconnect();
          await AudioSession.stopAudioSession();
          throw new Error("Connexion au talkie-walkie annulée.");
        }
        await room.localParticipant.setMicrophoneEnabled(false);
        liveKitRoomRef.current = room;
        setLiveKitConnected(true);
        return room;
      } finally {
        if (liveKitTokenControllerRef.current === controller) {
          liveKitTokenControllerRef.current = null;
        }
        setIsConnectingToLiveKit(false);
      }
    };

    const pending = connectRoom();
    liveKitConnectPromiseRef.current = pending;
    try {
      return await pending;
    } finally {
      liveKitConnectPromiseRef.current = null;
    }
  };

  const openPtt = () => {
    if (selectedChannelId !== "emergency") return;
    setIsPttVisible(true);
    void ensureLiveKitRoom().catch(() =>
      setPttError("Talkie-walkie indisponible"),
    );
  };

  const startTalking = async () => {
    pttPressedRef.current = true;
    try {
      const room = await ensureLiveKitRoom();
      if (!pttPressedRef.current) return;
      await room.localParticipant.setMicrophoneEnabled(true);
      if (pttPressedRef.current) setIsTalking(true);
    } catch {
      pttPressedRef.current = false;
      setPttError("Talkie-walkie indisponible");
    }
  };

  const stopTalking = () => {
    pttPressedRef.current = false;
    setIsTalking(false);
    const room = liveKitRoomRef.current;
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(false).catch((error) => {
        setPttError(
          error instanceof Error
            ? error.message
            : "Impossible de couper le microphone.",
        );
      });
    }
  };

  const closePtt = () => {
    stopTalking();
    setIsPttVisible(false);
    liveKitTokenControllerRef.current?.abort();
    const room = liveKitRoomRef.current;
    liveKitRoomRef.current = null;
    setLiveKitConnected(false);
    if (room) void room.disconnect();
    void AudioSession.stopAudioSession().catch((error: unknown) => {
      setPttError(
        error instanceof Error
          ? error.message
          : "Impossible de fermer la session audio.",
      );
    });
  };

  const formatMessageTime = (date: string) => {
    const timestamp = new Date(date);
    return Number.isNaN(timestamp.getTime())
      ? ""
      : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const ChannelIcon = selectedChannel.icon;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MessageSquare color="#2563eb" size={22} />
        </View>
        <Text style={styles.title}>Messages</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "Privés" }}
          onPress={() => {
            setActiveTab("Privés");
            setSelectedConversation(null);
          }}
          style={[styles.tab, activeTab === "Privés" && styles.tabSelected]}
        >
          <MessageSquare
            color={activeTab === "Privés" ? "#2563eb" : "#64748b"}
            size={17}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "Privés" && styles.tabTextSelected,
            ]}
          >
            Privés
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "Canaux" }}
          onPress={() => {
            setActiveTab("Canaux");
            setSelectedConversation(null);
          }}
          style={[styles.tab, activeTab === "Canaux" && styles.tabSelected]}
        >
          <Radio
            color={activeTab === "Canaux" ? "#2563eb" : "#64748b"}
            size={17}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "Canaux" && styles.tabTextSelected,
            ]}
          >
            Canaux
          </Text>
        </Pressable>
      </View>

      {activeTab === "Canaux" ? (
        <>
          <View style={styles.proximityBanner}>
            <MapPin color="#2563eb" size={17} />
            <Text style={styles.proximityText}>
              Messages communautaires en temps réel
            </Text>
          </View>
          <View style={styles.channelList}>
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          const isSelected = selectedChannelId === channel.id;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              key={channel.id}
              onPress={() => setSelectedChannelId(channel.id)}
              style={[
                styles.channelButton,
                isSelected && styles.channelButtonSelected,
              ]}
            >
              <Icon color={channel.color} size={17} />
              <Text
                style={[
                  styles.channelButtonText,
                  isSelected && styles.channelButtonTextSelected,
                ]}
              >
                {channel.label}
              </Text>
            </Pressable>
          );
        })}
          </View>

          <View style={styles.channelHeading}>
        <View style={[styles.channelIcon, { backgroundColor: selectedChannel.background }]}>
          <ChannelIcon color={selectedChannel.color} size={20} />
        </View>
        <View style={styles.channelCopy}>
          <Text style={styles.channelName}>{selectedChannel.label}</Text>
          <Text style={styles.channelDescription}>
            {selectedChannel.description}
          </Text>
        </View>
        {selectedChannelId === "emergency" && (
          <Pressable
            accessibilityLabel="Rejoindre le talkie-walkie URGENCES"
            accessibilityRole="button"
            onPress={openPtt}
            style={styles.liveButton}
          >
            <Radio color="#ffffff" size={15} />
            <Text style={styles.liveButtonText}>LIVE</Text>
          </Pressable>
        )}
          </View>
        </>
      ) : selectedConversation ? (
        <View style={styles.privateHeader}>
          <Pressable
            accessibilityLabel="Retour à la liste des conversations"
            accessibilityRole="button"
            onPress={() => setSelectedConversation(null)}
            style={styles.backButton}
          >
            <X color="#475569" size={20} />
          </Pressable>
          <View style={styles.participantAvatar}>
            <Text style={styles.participantInitial}>
              {selectedConversation.participantName
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toLocaleUpperCase()}
            </Text>
          </View>
          <View style={styles.channelCopy}>
            <Text style={styles.channelName}>
              {selectedConversation.participantName}
            </Text>
            <Text style={styles.channelDescription}>
              {selectedConversation.participantType === "seller"
                ? "Vendeur"
                : "Voisin"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.privateListContainer}>
          <Text style={styles.privateListTitle}>Conversations privées</Text>
          <VoiceTextInput
            accessibilityLabel="Rechercher un contact ou une conversation"
            onChangeText={setConversationSearch}
            placeholder="Rechercher un contact..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            value={conversationSearch}
          />
          {conversationsError && (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {conversationsError}
            </Text>
          )}
          {isLoadingConversations ? (
            <ActivityIndicator color="#2563eb" style={styles.loading} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.conversationList}
              showsVerticalScrollIndicator={false}
            >
              {filteredConversations.map((conversation) => (
                <Pressable
                  accessibilityRole="button"
                  key={conversation.id}
                  onPress={() => {
                    setDraftMessage("");
                    setSelectedConversation(conversation);
                  }}
                  style={styles.conversationCard}
                >
                  <View
                    style={[
                      styles.participantAvatar,
                      conversation.participantType === "seller" &&
                        styles.sellerAvatar,
                    ]}
                  >
                    <Text style={styles.participantInitial}>
                      {conversation.participantName
                        .split(/\s+/)
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toLocaleUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.conversationCopy}>
                    <View style={styles.conversationTopLine}>
                      <Text style={styles.conversationName}>
                        {conversation.participantName}
                      </Text>
                      <Text style={styles.timestamp}>
                        {formatMessageTime(conversation.updatedAt)}
                      </Text>
                    </View>
                    <View style={styles.conversationBottomLine}>
                      <Text numberOfLines={1} style={styles.lastMessage}>
                        {conversation.lastMessage ||
                          (conversation.participantType === "seller"
                            ? "Discussion avec le vendeur"
                            : "Discussion avec votre voisin")}
                      </Text>
                      <Text style={styles.participantType}>
                        {conversation.participantType === "seller"
                          ? "VENDEUR"
                          : "VOISIN"}
                      </Text>
                      {conversation.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>
                            {conversation.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
              {!conversationsError && filteredConversations.length === 0 && (
                <Text style={styles.emptyText}>
                  {conversationSearch
                    ? "Aucun contact ou message ne correspond à cette recherche."
                    : "Aucune conversation privée pour le moment."}
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {messagesError &&
        (activeTab === "Canaux" || selectedConversation) && (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {messagesError}
        </Text>
      )}

      {(activeTab === "Canaux" || selectedConversation) && <ScrollView
        contentContainerStyle={styles.messageThread}
        showsVerticalScrollIndicator={false}
      >
        {isLoadingMessages ? (
          <ActivityIndicator color="#2563eb" style={styles.loading} />
        ) : messages.length === 0 && !messagesError ? (
          <Text style={styles.emptyText}>Aucun message dans ce canal.</Text>
        ) : (
          messages.map((message) => (
            <Pressable
              accessibilityHint="Appui long pour signaler ce message"
              accessibilityRole="button"
              key={message.id}
              onLongPress={() => {
                setSelectedReport(message);
                setReportReason("");
              }}
              style={[
                styles.messageBubble,
                message.isOwnMessage && styles.ownMessageBubble,
              ]}
            >
              {!message.isOwnMessage && (
                <Text style={styles.messageSender}>{message.senderName}</Text>
              )}
              {message.imageUrl && (
                <Image
                  accessibilityLabel="Photo jointe au message"
                  source={{ uri: message.imageUrl }}
                  style={styles.messagePhoto}
                />
              )}
              {message.text.length > 0 && (
                <Text
                  style={[
                    styles.messageText,
                    message.isOwnMessage && styles.ownMessageText,
                  ]}
                >
                  {message.text}
                </Text>
              )}
              <Text
                style={[
                  styles.messageTime,
                  message.isOwnMessage && styles.ownMessageTime,
                ]}
              >
                {formatMessageTime(message.createdAt)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>}

      {(activeTab === "Canaux" || selectedConversation) && <View style={styles.composer}>
        <Pressable
          accessibilityLabel="Joindre une photo compressée en WebP"
          accessibilityRole="button"
          disabled={isSending}
          onPress={() => void pickAndSendPhoto()}
          style={styles.attachButton}
        >
          <ImagePlus color="#475569" size={20} />
        </Pressable>
        {activeTab === "Canaux" && selectedChannelId === "emergency" && (
          <Pressable
            accessibilityLabel="Ouvrir le talkie-walkie URGENCES"
            accessibilityRole="button"
            onPress={openPtt}
            style={styles.micButton}
          >
            <Radio color="#ffffff" size={17} />
            <Mic color="#ffffff" size={13} />
          </Pressable>
        )}
        <VoiceTextInput
          accessibilityLabel="Saisir un message"
          onChangeText={setDraftMessage}
          onSubmitEditing={() => void sendMessage()}
          placeholder="Écrire un message…"
          placeholderTextColor="#94a3b8"
          returnKeyType="send"
          style={styles.composerInput}
          value={draftMessage}
        />
        <Pressable
          accessibilityLabel="Envoyer le message"
          accessibilityRole="button"
          disabled={isSending}
          onPress={() => void sendMessage()}
          style={[styles.sendButton, isSending && styles.disabledButton]}
        >
          <Send color="#ffffff" size={18} />
        </Pressable>
      </View>}

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedReport(null)}
        transparent
        visible={selectedReport !== null}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <View style={styles.reportIcon}>
                <AlertTriangle color="#b91c1c" size={20} />
              </View>
              <Text style={styles.dialogTitle}>Signaler le message</Text>
              <Pressable
                accessibilityLabel="Fermer"
                accessibilityRole="button"
                onPress={() => setSelectedReport(null)}
                style={styles.closeButton}
              >
                <X color="#64748b" size={20} />
              </Pressable>
            </View>
            <Text style={styles.dialogDescription}>
              Indiquez pourquoi ce message doit être examiné par la modération.
            </Text>
            <VoiceTextInput
              accessibilityLabel="Motif du signalement"
              multiline
              onChangeText={setReportReason}
              placeholder="Motif du signalement"
              placeholderTextColor="#94a3b8"
              style={styles.reportInput}
              value={reportReason}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isSubmittingReport}
              onPress={() => void submitReport()}
              style={[
                styles.reportButton,
                isSubmittingReport && styles.disabledButton,
              ]}
            >
              {isSubmittingReport ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.reportButtonText}>Envoyer le signalement</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closePtt}
        transparent
        visible={isPttVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <View style={styles.reportIcon}>
                <Radio color="#dc2626" size={20} />
              </View>
              <Text style={styles.dialogTitle}>Talkie-walkie URGENCES</Text>
              <Pressable
                accessibilityLabel="Fermer le talkie-walkie"
                accessibilityRole="button"
                onPress={closePtt}
                style={styles.closeButton}
              >
                <X color="#64748b" size={20} />
              </Pressable>
            </View>
            <View style={styles.connectionStatus}>
              <View
                style={[
                  styles.statusDot,
                  liveKitConnected && styles.statusDotConnected,
                ]}
              />
              <Text style={styles.connectionText}>
                {isConnectingToLiveKit
                  ? "Connexion à la room audio…"
                  : liveKitConnected
                    ? "Connecté au canal audio"
                    : "Déconnecté"}
              </Text>
            </View>
            {pttError && (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {pttError}
              </Text>
            )}
            <Pressable
              accessibilityLabel={
                isTalking
                  ? "Relâcher pour couper le microphone"
                  : "Maintenir pour parler"
              }
              accessibilityRole="button"
              disabled={!liveKitConnected}
              onPressIn={() => void startTalking()}
              onPressOut={stopTalking}
              style={[
                styles.pttButton,
                isTalking && styles.pttButtonActive,
                !liveKitConnected && styles.disabledButton,
              ]}
            >
              <Mic color="#ffffff" size={30} />
              <Text style={styles.pttButtonText}>
                {isTalking ? "PARLEZ" : "MAINTENIR"}
              </Text>
            </Pressable>
            <Text style={styles.pttHint}>
              Maintenez le bouton pour transmettre, relâchez pour couper le micro.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#f5f7fa",
    flex: 1,
    paddingTop: 54,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    paddingBottom: 17,
    paddingHorizontal: 20,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  title: {
    color: "#172b4d",
    fontSize: 26,
    fontWeight: "700",
  },
  tabs: {
    backgroundColor: "#e8edf5",
    borderRadius: 12,
    flexDirection: "row",
    marginHorizontal: 20,
    padding: 4,
  },
  tab: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 40,
  },
  tabSelected: {
    backgroundColor: "#ffffff",
    elevation: 1,
  },
  tabText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextSelected: {
    color: "#2563eb",
  },
  proximityBanner: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderColor: "#dbeafe",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 13,
    padding: 12,
  },
  proximityText: {
    color: "#1e3a8a",
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  channelList: {
    flexDirection: "row",
    gap: 9,
    marginHorizontal: 20,
    marginTop: 13,
  },
  channelButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 42,
  },
  channelButtonSelected: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },
  channelButtonText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  channelButtonTextSelected: {
    color: "#1d4ed8",
  },
  channelHeading: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    flexDirection: "row",
    gap: 11,
    marginHorizontal: 20,
    marginTop: 11,
    padding: 11,
  },
  privateListContainer: {
    flex: 1,
    paddingTop: 18,
  },
  privateListTitle: {
    color: "#172b4d",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 11,
    borderWidth: 1,
    color: "#172b4d",
    fontSize: 14,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  conversationList: {
    paddingBottom: 112,
    paddingHorizontal: 20,
    paddingTop: 5,
  },
  conversationCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 9,
    padding: 12,
  },
  conversationCopy: {
    flex: 1,
  },
  conversationTopLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  conversationName: {
    color: "#172b4d",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  timestamp: {
    color: "#94a3b8",
    fontSize: 10,
    marginLeft: 8,
  },
  conversationBottomLine: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 5,
  },
  lastMessage: {
    color: "#64748b",
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    paddingRight: 8,
  },
  participantType: {
    backgroundColor: "#f1f5f9",
    borderRadius: 7,
    color: "#475569",
    fontSize: 8,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  unreadBadge: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 9,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  participantAvatar: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 25,
    height: 48,
    justifyContent: "center",
    marginRight: 12,
    width: 48,
  },
  sellerAvatar: {
    backgroundColor: "#fef3c7",
  },
  participantInitial: {
    color: "#1e3a8a",
    fontSize: 14,
    fontWeight: "800",
  },
  privateHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 10,
  },
  backButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 32,
  },
  channelIcon: {
    alignItems: "center",
    borderRadius: 11,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  channelCopy: {
    flex: 1,
  },
  channelName: {
    color: "#172b4d",
    fontSize: 13,
    fontWeight: "800",
  },
  channelDescription: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
  },
  liveButton: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 9,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  liveButtonText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 11,
    lineHeight: 16,
    marginHorizontal: 20,
    marginTop: 8,
  },
  messageThread: {
    flexGrow: 1,
    gap: 9,
    justifyContent: "flex-end",
    paddingBottom: 112,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  loading: {
    marginVertical: 20,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    paddingVertical: 18,
    textAlign: "center",
  },
  messageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 15,
    borderBottomLeftRadius: 4,
    maxWidth: "84%",
    padding: 11,
  },
  ownMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb",
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 4,
  },
  messageSender: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
  },
  messageText: {
    color: "#1e293b",
    fontSize: 13,
    lineHeight: 19,
  },
  ownMessageText: {
    color: "#ffffff",
  },
  messagePhoto: {
    borderRadius: 10,
    height: 180,
    marginBottom: 5,
    width: 220,
  },
  messageTime: {
    alignSelf: "flex-end",
    color: "#94a3b8",
    fontSize: 9,
    marginTop: 5,
  },
  ownMessageTime: {
    color: "#dbeafe",
  },
  composer: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 15,
    borderWidth: 1,
    bottom: 18,
    flexDirection: "row",
    gap: 7,
    left: 16,
    padding: 7,
    position: "absolute",
    right: 16,
  },
  attachButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 34,
  },
  micButton: {
    alignItems: "center",
    backgroundColor: "#16a34a",
    borderRadius: 19,
    flexDirection: "row",
    gap: 2,
    height: 38,
    justifyContent: "center",
    width: 44,
  },
  composerInput: {
    color: "#172b4d",
    flex: 1,
    fontSize: 13,
    maxHeight: 80,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 8,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  disabledButton: {
    opacity: 0.55,
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    maxWidth: 420,
    padding: 18,
    width: "100%",
  },
  dialogHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  reportIcon: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 11,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dialogTitle: {
    color: "#172b4d",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  closeButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  dialogDescription: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 13,
  },
  reportInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 11,
    borderWidth: 1,
    color: "#172b4d",
    fontSize: 13,
    minHeight: 88,
    marginTop: 12,
    padding: 11,
    textAlignVertical: "top",
  },
  reportButton: {
    alignItems: "center",
    backgroundColor: "#b91c1c",
    borderRadius: 11,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 44,
  },
  reportButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  connectionStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  statusDot: {
    backgroundColor: "#94a3b8",
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  statusDotConnected: {
    backgroundColor: "#16a34a",
  },
  connectionText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  pttButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#dc2626",
    borderColor: "#fee2e2",
    borderRadius: 45,
    borderWidth: 5,
    height: 90,
    justifyContent: "center",
    marginTop: 24,
    width: 90,
  },
  pttButtonActive: {
    backgroundColor: "#991b1b",
    transform: [{ scale: 0.96 }],
  },
  pttButtonText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 4,
  },
  pttHint: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    textAlign: "center",
  },
});
