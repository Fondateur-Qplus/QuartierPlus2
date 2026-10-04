import * as SMS from "expo-sms";
import * as Location from "expo-location";
import NetInfo from "@react-native-community/netinfo";
import { ShieldAlert, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Socket } from "socket.io-client";
import { openProfileStore } from "../storage/profileStore";

export type SosCoordinates = {
  latitude: number;
  longitude: number;
};

type EmergencyType = "MEDICAL" | "SECURITY" | "FIRE";

type SosButtonProps = {
  location: SosCoordinates | null;
  socket: Socket | null;
  onAlert: (payload: unknown) => void;
  openRequestId?: string;
};

const EMERGENCY_TYPES: { id: EmergencyType; label: string; emoji: string }[] = [
  { id: "MEDICAL", label: "Médical", emoji: "✚" },
  { id: "SECURITY", label: "Sécurité", emoji: "🛡" },
  { id: "FIRE", label: "Incendie", emoji: "🔥" },
];

const ESCALATION_LEVELS = [
  { level: 1, label: "3 km" },
  { level: 2, label: "10 km" },
  { level: 3, label: "30 km" },
];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Une erreur inattendue est survenue.";

export default function SosButton({
  location,
  socket,
  onAlert,
  openRequestId,
}: SosButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emergencyType, setEmergencyType] = useState<EmergencyType>("MEDICAL");
  const [escalationLevel, setEscalationLevel] = useState(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (openRequestId) setIsOpen(true);
  }, [openRequestId]);

  const sendOfflineSms = useCallback(async (coordinates: SosCoordinates) => {
    const store = await openProfileStore();
    const contacts = await store.getContacts();
    const recipients = [...new Set(
      contacts
        .map((contact) => contact.phone.trim())
        .filter((phone) => phone.length > 0),
    )];
    if (recipients.length === 0) {
      throw new Error(
        "Aucun contact de confiance n'est enregistré. Ajoutez-en un dans votre profil avant d'utiliser le relais SMS.",
      );
    }
    if (!(await SMS.isAvailableAsync())) {
      throw new Error("Le compositeur SMS n'est pas disponible sur cet appareil.");
    }

    const emergencyLabel =
      EMERGENCY_TYPES.find((item) => item.id === emergencyType)?.label ??
      "Urgence";
    const mapsLink = `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
    const message = [
      `SOS QuartierPlus — urgence ${emergencyLabel.toLowerCase()}.`,
      "J'ai besoin d'assistance. Ma position GPS :",
      `${coordinates.latitude}, ${coordinates.longitude}`,
      mapsLink,
    ].join("\n");
    const result = await SMS.sendSMSAsync(recipients, message);
    if (result.result === "cancelled") {
      Alert.alert("SMS annulé", "Le compositeur SMS a été fermé sans envoi.");
    } else if (result.result === "sent") {
      Alert.alert(
        "SMS envoyé",
        "L'application SMS indique que le message a été envoyé. La livraison dépend de votre opérateur.",
      );
    } else {
      Alert.alert(
        "Vérifiez le SMS de secours",
        "Le compositeur SMS s'est ouvert. Vérifiez les destinataires puis appuyez sur Envoyer pour transmettre votre alerte.",
      );
    }
  }, [emergencyType]);

  const triggerSos = useCallback(async () => {
    if (!location) {
      Alert.alert("Position indisponible", "Impossible de déterminer votre position GPS.");
      return;
    }
    setIsSending(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (position.mocked === true) {
        throw new Error("La position GPS est signalée comme simulée.");
      }
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const networkState = await NetInfo.fetch();
      const hasDataConnection =
        networkState.isConnected === true &&
        networkState.isInternetReachable !== false;
      if (!hasDataConnection) {
        await sendOfflineSms(coordinates);
        setIsOpen(false);
        return;
      }
      if (!socket?.connected) {
        throw new Error(
          "Le réseau de données est disponible, mais la connexion au service SOS est indisponible. Réessayez.",
        );
      }

      const result = await new Promise<unknown>((resolve, reject) => {
        socket.timeout(8000).emit(
          "sos:trigger",
          {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            emergency_type: emergencyType,
            escalation_level: escalationLevel,
          },
          (timeoutError: Error | null, acknowledgement: unknown) => {
            if (timeoutError) {
              reject(new Error("Le serveur SOS n'a pas répondu. Réessayez."));
              return;
            }
            resolve(acknowledgement);
          },
        );
      });
      if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        const message =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Le serveur n'a pas confirmé la réception de l'alerte.";
        throw new Error(message);
      }
      if ("alert" in result) onAlert(result.alert);
      setIsOpen(false);
      Alert.alert("Alerte SOS envoyée", "Votre alerte a été transmise aux voisins proches.");
    } catch (error) {
      Alert.alert("Envoi du SOS impossible", errorMessage(error));
    } finally {
      setIsSending(false);
    }
  }, [emergencyType, escalationLevel, location, onAlert, sendOfflineSms, socket]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown === 0) {
      setCountdown(null);
      void triggerSos();
      return undefined;
    }
    const timer = setTimeout(
      () => setCountdown((current) => current === null ? null : current - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [countdown, triggerSos]);

  const close = () => {
    if (isSending) return;
    setCountdown(null);
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityLabel="Déclencher une alerte SOS"
        accessibilityRole="button"
        onPress={() => setIsOpen(true)}
        style={styles.fab}
      >
        <ShieldAlert color="#ffffff" size={25} />
        <Text style={styles.fabText}>SOS</Text>
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={isOpen}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Alerte d'urgence</Text>
                <Text style={styles.subtitle}>
                  {countdown === null
                    ? "Choisissez le type d'aide nécessaire."
                    : "Envoi imminent — annulez si vous avez déclenché par erreur."}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Fermer"
                accessibilityRole="button"
                disabled={isSending}
                onPress={close}
                style={styles.close}
              >
                <X color="#64748b" size={20} />
              </Pressable>
            </View>

            {countdown === null && !isSending ? (
              <>
                <Text style={styles.sectionLabel}>Type d'urgence</Text>
                <View style={styles.options}>
                  {EMERGENCY_TYPES.map((type) => {
                    const selected = type.id === emergencyType;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={type.id}
                        onPress={() => setEmergencyType(type.id)}
                        style={[styles.option, selected && styles.optionSelected]}
                      >
                        <Text style={styles.optionEmoji}>{type.emoji}</Text>
                        <Text
                          style={[
                            styles.optionText,
                            selected && styles.optionTextSelected,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.sectionLabel}>Rayon d'alerte</Text>
                <View style={styles.radiusOptions}>
                  {ESCALATION_LEVELS.map((option) => {
                    const selected = option.level === escalationLevel;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={option.level}
                        onPress={() => setEscalationLevel(option.level)}
                        style={[styles.radiusOption, selected && styles.radiusOptionSelected]}
                      >
                        <Text
                          style={[
                            styles.radiusText,
                            selected && styles.radiusTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={!location}
                  onPress={() => setCountdown(3)}
                  style={[styles.trigger, !location && styles.disabled]}
                >
                  <ShieldAlert color="#ffffff" size={19} />
                  <Text style={styles.triggerText}>Lancer le compte à rebours</Text>
                </Pressable>
                {!location && (
                  <Text style={styles.locationNotice}>
                    En attente de la position GPS...
                  </Text>
                )}
              </>
            ) : (
              <View style={styles.countdownPanel}>
                {isSending ? (
                  <>
                    <ActivityIndicator color="#dc2626" size="large" />
                    <Text style={styles.countdownDescription}>
                      Transmission de votre alerte...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.countdownValue}>{countdown ?? 0}</Text>
                    <Text style={styles.countdownDescription}>
                      Votre alerte sera envoyée dans {countdown ?? 0} seconde{countdown === 1 ? "" : "s"}.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCountdown(null)}
                      style={styles.cancel}
                    >
                      <Text style={styles.cancelText}>Annuler le SOS</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 30,
    bottom: 24,
    elevation: 7,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    position: "absolute",
    right: 20,
    shadowColor: "#7f1d1d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  fabText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  dialog: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    maxWidth: 440,
    padding: 20,
    width: "100%",
  },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  title: { color: "#0f172a", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 310 },
  close: { alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  sectionLabel: { color: "#334155", fontSize: 13, fontWeight: "700", marginBottom: 9, marginTop: 20 },
  options: { flexDirection: "row", gap: 8 },
  option: { alignItems: "center", backgroundColor: "#f8fafc", borderColor: "#e2e8f0", borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 74, padding: 8 },
  optionSelected: { backgroundColor: "#fef2f2", borderColor: "#dc2626" },
  optionEmoji: { fontSize: 20, marginBottom: 5 },
  optionText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  optionTextSelected: { color: "#b91c1c" },
  radiusOptions: { flexDirection: "row", gap: 8 },
  radiusOption: { alignItems: "center", backgroundColor: "#f8fafc", borderColor: "#e2e8f0", borderRadius: 10, borderWidth: 1, flex: 1, padding: 11 },
  radiusOptionSelected: { backgroundColor: "#fff7ed", borderColor: "#f97316" },
  radiusText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  radiusTextSelected: { color: "#c2410c" },
  trigger: { alignItems: "center", backgroundColor: "#dc2626", borderRadius: 12, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 24, minHeight: 52, paddingHorizontal: 12 },
  triggerText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  locationNotice: { color: "#b91c1c", fontSize: 12, marginTop: 10, textAlign: "center" },
  countdownPanel: { alignItems: "center", paddingBottom: 8, paddingTop: 22 },
  countdownValue: { color: "#dc2626", fontSize: 72, fontWeight: "800", lineHeight: 82 },
  countdownDescription: { color: "#475569", fontSize: 14, marginBottom: 24, marginTop: 6, textAlign: "center" },
  cancel: { alignItems: "center", borderColor: "#dc2626", borderRadius: 12, borderWidth: 1.5, minHeight: 48, justifyContent: "center", paddingHorizontal: 24, width: "100%" },
  cancelText: { color: "#b91c1c", fontSize: 15, fontWeight: "800" },
});
