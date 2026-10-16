import { AudioSession, VideoTrack } from "@livekit/react-native";
import {
  Camera,
  CameraOff,
  Headphones,
  Mic,
  MicOff,
  PictureInPicture2,
  Radio,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, apiFetch, getStoredAuthToken } from "../services/api";
import { enterGrinPictureInPicture } from "../services/grinPictureInPicture";

type CameraTrackReference = {
  participant: Participant;
  publication: TrackPublication;
  source: Track.Source.Camera;
};

type GrinChair = {
  identity: string;
  name: string;
  participant: Participant;
  trackRef?: CameraTrackReference;
  isLocal: boolean;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
};

const MAX_CHAIRS = 6;
const LIVEKIT_UNAVAILABLE_MESSAGE =
  "Service vidéo/voix en cours d'activation";

const readChairs = (room: Room): GrinChair[] => {
  const participants = [
    room.localParticipant,
    ...room.remoteParticipants.values(),
  ];
  return participants.slice(0, MAX_CHAIRS).map((participant, index) => {
    const publication = participant.getTrackPublication(Track.Source.Camera);
    return {
      identity: participant.identity,
      name:
        participant.name ||
        (participant === room.localParticipant ? "Vous" : `Voisin ${index}`),
      participant,
      trackRef: publication
        ? {
            participant,
            publication,
            source: Track.Source.Camera,
          }
        : undefined,
      isLocal: participant === room.localParticipant,
      isCameraEnabled: participant.isCameraEnabled,
      isMicrophoneEnabled: participant.isMicrophoneEnabled,
    };
  });
};

const requestAndroidAvPermissions = async () => {
  if (Platform.OS !== "android") return;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  if (
    result[PermissionsAndroid.PERMISSIONS.CAMERA] !==
      PermissionsAndroid.RESULTS.GRANTED ||
    result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !==
      PermissionsAndroid.RESULTS.GRANTED
  ) {
    throw new Error("Autorisez la caméra et le microphone pour prendre une chaise.");
  }
};

export default function GrinScreen() {
  const { isOffline } = useAuth();
  const { width } = useWindowDimensions();
  const roomRef = useRef<Room | null>(null);
  const connectionRef = useRef<Promise<Room> | null>(null);
  const mountedRef = useRef(false);
  const pipVideoRef = useRef<ComponentRef<typeof VideoTrack> | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnChair, setIsOnChair] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [chairs, setChairs] = useState<GrinChair[]>([]);
  const [pipIdentity, setPipIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (): Promise<Room> => {
    if (roomRef.current?.state === "connected") return roomRef.current;
    if (connectionRef.current) return connectionRef.current;
    if (!API_BASE_URL) throw new Error("L'adresse API n'est pas configurée.");
    if (isOffline) throw new Error("Le Grin nécessite une connexion Internet.");

    const pending = (async () => {
      setIsConnecting(true);
      setError(null);
      try {
        const token = await getStoredAuthToken();
        if (!token) throw new Error("Connectez-vous pour rejoindre le Grin.");
        const response = await apiFetch(`${API_BASE_URL}/v1/livekit/token`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ roomName: "grin" }),
        });
        if (!response.ok) {
          throw new Error(LIVEKIT_UNAVAILABLE_MESSAGE);
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
          throw new Error(LIVEKIT_UNAVAILABLE_MESSAGE);
        }

        await AudioSession.startAudioSession();
        const room = new Room({ adaptiveStream: true, dynacast: true });
        const refreshChairs = () => {
          if (!mountedRef.current) return;
          const nextChairs = readChairs(room);
          setChairs(nextChairs);
          setIsCameraEnabled(room.localParticipant.isCameraEnabled);
          setIsMicrophoneEnabled(room.localParticipant.isMicrophoneEnabled);
        };
        for (const event of [
          RoomEvent.ParticipantConnected,
          RoomEvent.ParticipantDisconnected,
          RoomEvent.TrackPublished,
          RoomEvent.TrackUnpublished,
          RoomEvent.TrackSubscribed,
          RoomEvent.TrackUnsubscribed,
          RoomEvent.TrackMuted,
          RoomEvent.TrackUnmuted,
          RoomEvent.LocalTrackPublished,
          RoomEvent.LocalTrackUnpublished,
        ]) {
          room.on(event, refreshChairs);
        }
        room.on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          if (!mountedRef.current) return;
          setIsConnected(false);
          setIsOnChair(false);
          setIsCameraEnabled(false);
          setIsMicrophoneEnabled(false);
          setChairs([]);
        });
        await room.connect(payload.url, payload.token);
        if (!mountedRef.current) {
          await room.disconnect();
          await AudioSession.stopAudioSession();
          throw new Error("La connexion au Grin a été interrompue.");
        }
        roomRef.current = room;
        setIsConnected(true);
        refreshChairs();
        return room;
      } catch (connectError) {
        await AudioSession.stopAudioSession().catch((audioError: unknown) => {
          console.error("Unable to stop failed Grin audio session:", audioError);
        });
        throw connectError;
      } finally {
        setIsConnecting(false);
      }
    })();

    connectionRef.current = pending;
    try {
      return await pending;
    } finally {
      connectionRef.current = null;
    }
  }, [isOffline]);

  useEffect(() => {
    mountedRef.current = true;
    if (isOffline) {
      setError("Connectez-vous à Internet pour rejoindre le Grin en direct.");
      return () => {
        mountedRef.current = false;
      };
    }
    void connect().catch((connectError: unknown) => {
      if (!mountedRef.current) return;
      setError(
        connectError instanceof Error &&
          /connectez-vous|connexion internet/i.test(connectError.message)
          ? connectError.message
          : LIVEKIT_UNAVAILABLE_MESSAGE,
      );
    });
    return () => {
      mountedRef.current = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
      void AudioSession.stopAudioSession().catch((audioError: unknown) => {
        console.error("Unable to stop Grin audio session:", audioError);
      });
    };
  }, [connect, isOffline]);

  const joinChair = async () => {
    try {
      const room = await connect();
      if (
        !room.localParticipant.isCameraEnabled &&
        readChairs(room).length >= MAX_CHAIRS
      ) {
        throw new Error("Les six chaises du Grin sont déjà occupées.");
      }
      await requestAndroidAvPermissions();
      await room.localParticipant.setCameraEnabled(true);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (microphoneError) {
        await room.localParticipant.setCameraEnabled(false);
        throw microphoneError;
      }
      setIsOnChair(true);
      setIsCameraEnabled(true);
      setIsMicrophoneEnabled(true);
      setError(null);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          && /six chaises|autorisez la caméra et le microphone/i.test(
            joinError.message,
          )
          ? joinError.message
          : LIVEKIT_UNAVAILABLE_MESSAGE,
      );
    }
  };

  const leaveChair = async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant) return;
    try {
      await participant.setMicrophoneEnabled(false);
      await participant.setCameraEnabled(false);
      setIsOnChair(false);
      setIsMicrophoneEnabled(false);
      setIsCameraEnabled(false);
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Impossible de quitter la chaise.",
      );
    }
  };

  const toggleCamera = async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant || !isOnChair) return;
    try {
      await participant.setCameraEnabled(!isCameraEnabled);
      setIsCameraEnabled(!isCameraEnabled);
    } catch (cameraError) {
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Impossible de modifier la caméra.",
      );
    }
  };

  const toggleMicrophone = async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant || !isOnChair) return;
    try {
      await participant.setMicrophoneEnabled(!isMicrophoneEnabled);
      setIsMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (microphoneError) {
      setError(
        microphoneError instanceof Error
          ? microphoneError.message
          : "Impossible de modifier le microphone.",
      );
    }
  };

  const retryConnection = () => {
    void connect().catch(() => setError(LIVEKIT_UNAVAILABLE_MESSAGE));
  };

  const togglePictureInPicture = () => {
    try {
      const entered = enterGrinPictureInPicture(pipVideoRef);
      if (!entered) {
        Alert.alert(
          "PiP indisponible",
          Platform.OS === "android"
            ? "Le mode PiP nécessite Android 8 ou une version ultérieure."
            : "Le mode PiP n'est pas pris en charge sur cet appareil.",
        );
      }
    } catch (pipError) {
      Alert.alert(
        "PiP indisponible",
        pipError instanceof Error
          ? pipError.message
          : "Impossible d'ouvrir le Grin en mode miniature.",
      );
    }
  };

  const selectedPipIdentity =
    pipIdentity && chairs.some((chair) => chair.identity === pipIdentity)
      ? pipIdentity
      : chairs.find((chair) => chair.trackRef)?.identity ?? null;
  const isCompact = width < 360;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Users color="#7c3aed" size={23} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Grin du quartier</Text>
          <Text style={styles.subtitle}>Rencontre vidéo en direct</Text>
        </View>
        <View style={[styles.connectionBadge, isConnected && styles.connectedBadge]}>
          {isConnected ? (
            <Wifi color="#15803d" size={16} />
          ) : (
            <WifiOff color="#64748b" size={16} />
          )}
        </View>
      </View>

      {!isCompact && (
        <View style={styles.roomCard}>
          <Radio color="#7c3aed" size={18} />
          <View style={styles.roomCopy}>
            <Text style={styles.roomTitle}>Salon du quartier</Text>
            <Text style={styles.roomSubtitle}>
              {isConnecting
                ? "Connexion au salon..."
                : `${chairs.length}/${MAX_CHAIRS} chaises occupées`}
            </Text>
          </View>
          {isConnecting ? (
            <ActivityIndicator color="#7c3aed" />
          ) : (
            <View style={styles.seatCount}>
              <Users color="#6d28d9" size={15} />
              <Text style={styles.seatCountText}>
                {chairs.length}/{MAX_CHAIRS}
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.compactContent,
        ]}
      >
        <View style={styles.grid}>
          {chairs.map((chair) => {
            const isPipTarget = chair.identity === selectedPipIdentity;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${chair.name}${isPipTarget ? ", sélectionné pour PiP" : ""}`}
                key={chair.identity}
                onPress={() => setPipIdentity(chair.identity)}
                style={[
                  styles.chair,
                  isCompact && styles.compactChair,
                  isPipTarget && styles.selectedChair,
                ]}
              >
                {chair.trackRef ? (
                  <VideoTrack
                    ref={isPipTarget ? pipVideoRef : undefined}
                    iosPIP={{
                      enabled: Platform.OS === "ios",
                      startAutomatically: true,
                      preferredSize: { width: 16, height: 9 },
                    }}
                    mirror={chair.isLocal}
                    objectFit="cover"
                    style={StyleSheet.absoluteFill}
                    trackRef={chair.trackRef}
                  />
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    {chair.isCameraEnabled ? (
                      <ActivityIndicator color="#c4b5fd" />
                    ) : (
                      <CameraOff color="#c4b5fd" size={30} />
                    )}
                  </View>
                )}
                <View style={styles.chairOverlay}>
                  <Text numberOfLines={1} style={styles.chairName}>
                    {chair.name}
                  </Text>
                  <View style={styles.chairStatus}>
                    {chair.isMicrophoneEnabled ? (
                      <Mic color="#ffffff" size={14} />
                    ) : (
                      <MicOff color="#fecaca" size={14} />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
          {chairs.length === 0 && (
            <View style={styles.emptyState}>
              <Headphones color="#94a3b8" size={34} />
              <Text style={styles.emptyTitle}>Le Grin est prêt</Text>
              <Text style={styles.emptyText}>
                Prenez une chaise pour rejoindre la conversation vidéo.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controls}>
          {isOnChair ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isCameraEnabled ? "Désactiver la caméra" : "Activer la caméra"}
                onPress={() => void toggleCamera()}
                style={[styles.controlButton, isCameraEnabled && styles.controlActive]}
              >
                {isCameraEnabled ? (
                  <Camera color="#ffffff" size={21} />
                ) : (
                  <CameraOff color="#334155" size={21} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isMicrophoneEnabled ? "Couper le microphone" : "Activer le microphone"}
                onPress={() => void toggleMicrophone()}
                style={[styles.controlButton, isMicrophoneEnabled && styles.controlActive]}
              >
                {isMicrophoneEnabled ? (
                  <Mic color="#ffffff" size={21} />
                ) : (
                  <MicOff color="#334155" size={21} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void leaveChair()}
                style={[styles.joinButton, styles.leaveButton]}
              >
                <Text style={styles.joinButtonText}>Quitter le Grin</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!isConnected || chairs.length >= MAX_CHAIRS}
              onPress={() => void joinChair()}
              style={[
                styles.joinButton,
                (!isConnected || chairs.length >= MAX_CHAIRS) &&
                  styles.disabledButton,
              ]}
            >
              <Camera color="#ffffff" size={18} />
              <Text style={styles.joinButtonText}>
                {chairs.length >= MAX_CHAIRS
                  ? "Toutes les chaises sont prises"
                  : "Prendre une chaise"}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réduire le Grin en mode PiP"
            disabled={!isConnected || selectedPipIdentity === null}
            onPress={togglePictureInPicture}
            style={[
              styles.pipButton,
              (!isConnected || selectedPipIdentity === null) && styles.disabledPip,
            ]}
          >
            <PictureInPicture2 color="#334155" size={21} />
          </Pressable>
        </View>
      </ScrollView>

      {error && (
        <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
          {!isOffline && !isConnected && (
            <Pressable accessibilityRole="button" onPress={retryConnection}>
              <Text style={styles.retryText}>Réessayer</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f8fafc", flex: 1, paddingHorizontal: 18, paddingTop: 56 },
  header: { alignItems: "center", flexDirection: "row", gap: 11 },
  logo: { alignItems: "center", backgroundColor: "#ede9fe", borderRadius: 15, height: 48, justifyContent: "center", width: 48 },
  headerText: { flex: 1 },
  title: { color: "#0f172a", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 3 },
  connectionBadge: { alignItems: "center", backgroundColor: "#e2e8f0", borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  connectedBadge: { backgroundColor: "#dcfce7" },
  roomCard: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 12, marginTop: 22, padding: 14 },
  roomCopy: { flex: 1 },
  roomTitle: { color: "#1e293b", fontSize: 14, fontWeight: "700" },
  roomSubtitle: { color: "#64748b", fontSize: 12, marginTop: 4 },
  seatCount: { alignItems: "center", backgroundColor: "#f3e8ff", borderRadius: 14, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  seatCountText: { color: "#6d28d9", fontSize: 12, fontWeight: "700" },
  content: { flexGrow: 1, paddingBottom: 112, paddingTop: 18 },
  compactContent: { paddingTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  chair: { backgroundColor: "#1e1b4b", borderColor: "#e2e8f0", borderRadius: 14, borderWidth: 2, height: 166, overflow: "hidden", width: "48%" },
  compactChair: { height: 125 },
  selectedChair: { borderColor: "#8b5cf6" },
  cameraPlaceholder: { alignItems: "center", backgroundColor: "#312e81", flex: 1, justifyContent: "center" },
  chairOverlay: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.70)", bottom: 0, flexDirection: "row", justifyContent: "space-between", left: 0, paddingHorizontal: 10, paddingVertical: 8, position: "absolute", right: 0 },
  chairName: { color: "#ffffff", flex: 1, fontSize: 12, fontWeight: "700", marginRight: 8 },
  chairStatus: { alignItems: "center", backgroundColor: "rgba(15,23,42,0.6)", borderRadius: 12, height: 24, justifyContent: "center", width: 24 },
  emptyState: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 16, borderWidth: 1, minHeight: 210, justifyContent: "center", padding: 24, width: "100%" },
  emptyTitle: { color: "#334155", fontSize: 16, fontWeight: "700", marginTop: 13 },
  emptyText: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
  controls: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "center", marginTop: 20 },
  controlButton: { alignItems: "center", backgroundColor: "#e2e8f0", borderRadius: 25, height: 50, justifyContent: "center", width: 50 },
  controlActive: { backgroundColor: "#7c3aed" },
  joinButton: { alignItems: "center", backgroundColor: "#7c3aed", borderRadius: 25, flex: 1, flexDirection: "row", gap: 8, height: 50, justifyContent: "center", paddingHorizontal: 16 },
  leaveButton: { backgroundColor: "#dc2626" },
  disabledButton: { backgroundColor: "#94a3b8" },
  joinButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  pipButton: { alignItems: "center", backgroundColor: "#e2e8f0", borderRadius: 25, height: 50, justifyContent: "center", width: 50 },
  disabledPip: { opacity: 0.45 },
  errorCard: { backgroundColor: "#fef2f2", borderRadius: 12, marginBottom: 16, padding: 13 },
  errorText: { color: "#b91c1c", fontSize: 12, lineHeight: 18 },
  retryText: { color: "#1d4ed8", fontSize: 13, fontWeight: "700", marginTop: 8 },
});
