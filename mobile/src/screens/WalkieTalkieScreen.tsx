import { AudioSession } from "@livekit/react-native";
import { Mic, Radio, Wifi, WifiOff } from "lucide-react-native";
import { Room, RoomEvent, type Participant } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, getStoredAuthToken } from "../services/api";

type ActiveSpeaker = {
  identity: string;
  name: string;
};

const speakerLabel = (participant: Participant): ActiveSpeaker => ({
  identity: participant.identity,
  name: participant.name || participant.identity,
});

export default function WalkieTalkieScreen() {
  const { isOffline } = useAuth();
  const roomRef = useRef<Room | null>(null);
  const connectPromiseRef = useRef<Promise<Room> | null>(null);
  const pressedRef = useRef(false);
  const mountedRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [speakers, setSpeakers] = useState<ActiveSpeaker[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (): Promise<Room> => {
    if (roomRef.current?.state === "connected") return roomRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;
    if (!API_BASE_URL) throw new Error("L'adresse API n'est pas configurée.");
    if (isOffline) throw new Error("Le talkie-walkie nécessite une connexion Internet.");

    const pending = (async () => {
      setIsConnecting(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/livekit/token`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(await getAuthorizationHeader()),
          },
          body: JSON.stringify({ room: "emergency" }),
        });
        if (!response.ok) {
          throw new Error(`Connexion audio refusée (HTTP ${response.status}).`);
        }
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !("token" in payload) ||
          typeof payload.token !== "string" ||
          !("url" in payload) ||
          typeof payload.url !== "string"
        ) {
          throw new Error("La réponse LiveKit est invalide.");
        }
        await AudioSession.startAudioSession();
        const room = new Room();
        room.on(RoomEvent.ActiveSpeakersChanged, (activeParticipants) => {
          setSpeakers(activeParticipants.map(speakerLabel));
        });
        room.on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setIsConnected(false);
          setIsTalking(false);
          setSpeakers([]);
        });
        await room.connect(payload.url, payload.token);
        await room.localParticipant.setMicrophoneEnabled(false);
        if (!mountedRef.current) {
          await room.disconnect();
          await AudioSession.stopAudioSession();
          throw new Error("La connexion audio a été interrompue.");
        }
        roomRef.current = room;
        setIsConnected(true);
        setSpeakers(room.activeSpeakers.map(speakerLabel));
        return room;
      } catch (connectError) {
        await AudioSession.stopAudioSession().catch((audioError: unknown) => {
          console.error("Unable to stop failed LiveKit audio session:", audioError);
        });
        throw connectError;
      } finally {
        setIsConnecting(false);
      }
    })();
    connectPromiseRef.current = pending;
    try {
      return await pending;
    } finally {
      connectPromiseRef.current = null;
    }
  }, [isOffline]);

  useEffect(() => {
    mountedRef.current = true;
    if (isOffline) {
      setError("Connectez-vous à Internet pour rejoindre le canal vocal.");
      return () => {
        mountedRef.current = false;
      };
    }
    void connect().catch((connectError: unknown) => {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Impossible de rejoindre le canal URGENCES.",
      );
    });
    return () => {
      mountedRef.current = false;
      pressedRef.current = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
      void AudioSession.stopAudioSession().catch((audioError: unknown) => {
        console.error("Unable to stop LiveKit audio session:", audioError);
      });
    };
  }, [connect, isOffline]);

  const startTalking = async () => {
    pressedRef.current = true;
    try {
      const room = await connect();
      if (!pressedRef.current) return;
      await room.localParticipant.setMicrophoneEnabled(true);
      if (pressedRef.current) setIsTalking(true);
    } catch (talkError) {
      pressedRef.current = false;
      setError(
        talkError instanceof Error
          ? talkError.message
          : "Impossible d'activer le microphone.",
      );
    }
  };

  const stopTalking = () => {
    pressedRef.current = false;
    setIsTalking(false);
    const room = roomRef.current;
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(false).catch((muteError: unknown) => {
        setError(
          muteError instanceof Error
            ? muteError.message
            : "Impossible de couper le microphone.",
        );
      });
    }
  };

  const retryConnection = () => {
    void connect().catch((connectError: unknown) => {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Impossible de rejoindre le canal URGENCES.",
      );
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Radio color="#dc2626" size={23} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Talkie-walkie</Text>
          <Text style={styles.subtitle}>Canal vocal URGENCES</Text>
        </View>
        <View style={[styles.connectionBadge, isConnected ? styles.connectedBadge : null]}>
          {isConnected ? (
            <Wifi color="#15803d" size={16} />
          ) : (
            <WifiOff color="#64748b" size={16} />
          )}
        </View>
      </View>

      <View style={styles.channelCard}>
        <View style={styles.liveDot} />
        <View style={styles.channelInfo}>
          <Text style={styles.channelName}>URGENCES</Text>
          <Text style={styles.channelDetails}>
            {isConnecting
              ? "Connexion à la room sécurisée..."
              : isConnected
                ? "Audio en direct · micro fermé"
                : "Non connecté"}
          </Text>
        </View>
        {isConnecting && <ActivityIndicator color="#dc2626" />}
      </View>

      <View style={styles.talkArea}>
        <View style={[styles.ripple, isTalking && styles.rippleActive]}>
          <Pressable
            accessibilityLabel={
              isTalking ? "Relâcher pour arrêter de parler" : "Maintenir pour parler"
            }
            accessibilityRole="button"
            disabled={!isConnected && !isConnecting}
            onPressIn={() => void startTalking()}
            onPressOut={stopTalking}
            style={[
              styles.talkButton,
              isTalking && styles.talkButtonActive,
              !isConnected && styles.talkButtonDisabled,
            ]}
          >
            <Mic color="#ffffff" size={38} />
            <Text style={styles.talkButtonText}>
              {isTalking ? "PARLEZ" : "MAINTENIR"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.instruction}>
          Appuyez et maintenez pour parler. Relâchez pour écouter.
        </Text>
      </View>

      <View style={styles.speakersCard}>
        <Text style={styles.speakersTitle}>Personnes qui parlent</Text>
        <ScrollView contentContainerStyle={styles.speakersList}>
          {isTalking && (
            <View style={styles.speakerRow}>
              <View style={[styles.speakerAvatar, styles.localAvatar]}>
                <Mic color="#ffffff" size={15} />
              </View>
              <Text style={styles.speakerName}>Vous</Text>
              <View style={styles.speakingIndicator}>
                <View style={styles.speakingBar} />
                <View style={[styles.speakingBar, styles.speakingBarTall]} />
                <View style={styles.speakingBar} />
              </View>
            </View>
          )}
          {speakers
            .filter((speaker) => speaker.identity !== roomRef.current?.localParticipant.identity)
            .map((speaker) => (
              <View key={speaker.identity} style={styles.speakerRow}>
                <View style={styles.speakerAvatar}>
                  <Text style={styles.speakerInitial}>
                    {speaker.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.speakerName}>{speaker.name}</Text>
                <View style={[styles.speakingIndicator, styles.remoteSpeakingIndicator]}>
                  <View style={styles.speakingBar} />
                  <View style={[styles.speakingBar, styles.speakingBarTall]} />
                  <View style={styles.speakingBar} />
                </View>
              </View>
            ))}
          {!isTalking && speakers.length === 0 && (
            <Text style={styles.emptySpeakers}>Personne ne parle pour le moment.</Text>
          )}
        </ScrollView>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          {!isOffline && (
            <Pressable accessibilityRole="button" onPress={retryConnection}>
              <Text style={styles.retryText}>Réessayer</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

async function getAuthorizationHeader(): Promise<Record<string, string>> {
  const token = await getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f8fafc", flex: 1, paddingHorizontal: 20, paddingTop: 58 },
  header: { alignItems: "center", flexDirection: "row", gap: 11 },
  logo: { alignItems: "center", backgroundColor: "#fee2e2", borderRadius: 15, height: 48, justifyContent: "center", width: 48 },
  headerText: { flex: 1 },
  title: { color: "#0f172a", fontSize: 23, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 3 },
  connectionBadge: { alignItems: "center", backgroundColor: "#e2e8f0", borderRadius: 16, height: 34, justifyContent: "center", width: 34 },
  connectedBadge: { backgroundColor: "#dcfce7" },
  channelCard: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 15, borderWidth: 1, flexDirection: "row", marginTop: 26, padding: 15 },
  liveDot: { backgroundColor: "#16a34a", borderRadius: 5, height: 10, marginRight: 12, width: 10 },
  channelInfo: { flex: 1 },
  channelName: { color: "#0f172a", fontSize: 14, fontWeight: "800", letterSpacing: 0.6 },
  channelDetails: { color: "#64748b", fontSize: 12, marginTop: 4 },
  talkArea: { alignItems: "center", justifyContent: "center", minHeight: 350 },
  ripple: { alignItems: "center", backgroundColor: "#fee2e2", borderRadius: 125, height: 250, justifyContent: "center", width: 250 },
  rippleActive: { backgroundColor: "#fecaca" },
  talkButton: { alignItems: "center", backgroundColor: "#dc2626", borderRadius: 98, elevation: 5, height: 196, justifyContent: "center", width: 196 },
  talkButtonActive: { backgroundColor: "#991b1b", transform: [{ scale: 0.97 }] },
  talkButtonDisabled: { opacity: 0.5 },
  talkButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900", letterSpacing: 1.2, marginTop: 12 },
  instruction: { color: "#64748b", fontSize: 13, marginTop: -20, textAlign: "center" },
  speakersCard: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 15, borderWidth: 1, minHeight: 120, padding: 15 },
  speakersTitle: { color: "#334155", fontSize: 14, fontWeight: "700" },
  speakersList: { gap: 12, paddingBottom: 112, paddingTop: 14 },
  speakerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  speakerAvatar: { alignItems: "center", backgroundColor: "#dbeafe", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  localAvatar: { backgroundColor: "#dc2626" },
  speakerInitial: { color: "#1d4ed8", fontSize: 14, fontWeight: "800" },
  speakerName: { color: "#334155", flex: 1, fontSize: 13, fontWeight: "600" },
  speakingIndicator: { alignItems: "center", flexDirection: "row", gap: 3, height: 20 },
  remoteSpeakingIndicator: { opacity: 0.85 },
  speakingBar: { backgroundColor: "#16a34a", borderRadius: 2, height: 8, width: 3 },
  speakingBarTall: { height: 16 },
  emptySpeakers: { color: "#94a3b8", fontSize: 12, paddingBottom: 2 },
  errorCard: { backgroundColor: "#fef2f2", borderRadius: 12, marginTop: 14, padding: 13 },
  errorText: { color: "#b91c1c", fontSize: 12, lineHeight: 18 },
  retryText: { color: "#1d4ed8", fontSize: 13, fontWeight: "700", marginTop: 8 },
});
