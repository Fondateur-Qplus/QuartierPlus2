import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import api from "../../services/api";
import type { EventSummary, EventsStackParamList } from "../../navigation/types";

type Navigation = NativeStackNavigationProp<EventsStackParamList, "OrganizerScanner">;
type ScanResult = {
  status: "SUCCESS" | "ALREADY_USED" | "INVALID_TICKET";
  ticket_id?: string;
  scanned_at?: string;
  checked_in_count?: number;
  total_capacity?: number;
  event_title?: string;
};

export default function OrganizerScannerScreen() {
  const navigation = useNavigation<Navigation>();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [events, setEvents] = useState<
    (Pick<EventSummary, "id" | "title" | "event_date" | "total_capacity"> & {
      checked_in_count: number;
    })[]
  >([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventError, setEventError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const scanLock = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(
      () => {
        let active = true;
        const refreshEvents = () => {
          void api
            .get<{ events: typeof events }>("/v1/events/mine", {
              headers: { "Cache-Control": "no-cache" },
            })
            .then(({ data }) => {
              if (!active) return;
              setEvents(data.events);
              setSelectedEventId((current) =>
                data.events.some((event) => event.id === current)
                  ? current
                  : data.events[0]?.id ?? "",
              );
              setEventError(null);
            })
            .catch((loadError: unknown) => {
              if (active) {
                setEventError(
                  loadError instanceof Error
                    ? loadError.message
                    : "Impossible de charger vos événements.",
                );
              }
            });
        };
        refreshEvents();
        const refreshInterval = setInterval(refreshEvents, 10_000);
        return () => {
          active = false;
          clearInterval(refreshInterval);
          if (cooldown.current) clearTimeout(cooldown.current);
          Speech.stop();
        };
      },
      [],
    ),
  );

  useEffect(() => {
    const selectedEvent = events.find((event) => event.id === selectedEventId);
    setEntryCount(selectedEvent?.checked_in_count ?? 0);
    setResult(null);
  }, [events, selectedEventId]);

  const validateCode = async (qrPayload: string) => {
    if (scanLock.current || !selectedEventId) return;
    scanLock.current = true;
    setIsProcessing(true);
    setIsScanning(false);
    setScanError(null);
    try {
      const response = await api.post<ScanResult>("/v1/tickets/scan", {
        qr_payload: qrPayload.trim(),
        event_id: selectedEventId,
      });
      const scanResult = response.data;
      if (
        !["SUCCESS", "ALREADY_USED", "INVALID_TICKET"].includes(
          scanResult.status,
        )
      ) {
        throw new Error("Le serveur a renvoyé un résultat de scan invalide.");
      }
      setResult(scanResult);
      if (scanResult.status === "SUCCESS") {
        if (typeof scanResult.checked_in_count === "number") {
          setEntryCount(scanResult.checked_in_count);
        } else {
          setEntryCount((count) => count + 1);
        }
        Vibration.vibrate(120);
        Speech.speak("Billet valide", { language: "fr-FR" });
      } else {
        Vibration.vibrate([0, 90, 70, 90]);
        Speech.speak(
          scanResult.status === "ALREADY_USED"
            ? "Billet déjà utilisé"
            : "Billet invalide",
          { language: "fr-FR" },
        );
      }
    } catch (scanError) {
      setResult(null);
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Le serveur n'a pas pu valider ce billet.";
      setScanError(message);
      Vibration.vibrate([0, 90, 70, 90]);
      Speech.speak("Erreur de validation. Vérifiez le réseau.", {
        language: "fr-FR",
      });
    } finally {
      setIsProcessing(false);
      cooldown.current = setTimeout(() => {
        scanLock.current = false;
        setIsScanning(true);
      }, 1800);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Retour</Text>
      </Pressable>
      <Text style={styles.title}>Contrôle des entrées</Text>
      <View style={styles.counter}>
        <Text style={styles.counterLabel}>
          Entrées validées · {entryCount} /{" "}
          {events.find((event) => event.id === selectedEventId)?.total_capacity ?? 0}
        </Text>
        <Text style={styles.counterValue}>{entryCount}</Text>
      </View>
      <Text style={styles.sectionTitle}>Événement contrôlé</Text>
      {eventError && (
        <Text accessibilityRole="alert" style={styles.error}>{eventError}</Text>
      )}
      <View style={styles.eventList}>
        {events.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedEventId === event.id }}
            onPress={() => setSelectedEventId(event.id)}
            style={[
              styles.eventChoice,
              selectedEventId === event.id && styles.selectedEvent,
            ]}
          >
            <Text
              style={[
                styles.eventChoiceText,
                selectedEventId === event.id && styles.selectedEventText,
              ]}
            >
              {event.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {!events.length && !eventError && (
        <Text style={styles.help}>
          Aucun événement n’est associé à votre compte organisateur.
        </Text>
      )}

      {!events.length ? null : !permission.granted ? (
        <View style={styles.permission}>
          <Text style={styles.help}>
            Autorisez la caméra pour scanner les pass des événements que vous organisez.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void requestPermission()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Autoriser la caméra</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cameraFrame}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              isScanning && !isProcessing && Boolean(selectedEventId)
                ? ({ data }) => void validateCode(data)
                : undefined
            }
            facing="back"
            style={styles.camera}
          />
          <View pointerEvents="none" style={styles.scanOverlay}>
            <View style={styles.scanBox} />
          </View>
        </View>
      )}

      {isProcessing && (
        <View style={styles.processing}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.help}>Validation cryptographique…</Text>
        </View>
      )}
      {result && (
        <View
          accessibilityRole="alert"
          style={[
            styles.feedback,
            result.status === "SUCCESS" ? styles.success : styles.failure,
          ]}
        >
          <Text style={styles.feedbackTitle}>
            {result.status === "SUCCESS"
              ? "✓ Billet valide"
              : result.status === "ALREADY_USED"
                ? "✕ Billet déjà utilisé"
                : "✕ Faux billet ou signature invalide"}
          </Text>
          {result.scanned_at && (
            <Text style={styles.feedbackText}>
              Entrée enregistrée à {new Date(result.scanned_at).toLocaleTimeString("fr-FR")}
            </Text>
          )}
        </View>
      )}
      {scanError && (
        <Text accessibilityRole="alert" style={styles.error}>
          Validation impossible : {scanError}
        </Text>
      )}
      <Text style={styles.sectionTitle}>Saisie manuelle de secours</Text>
      <Text style={styles.help}>Format : identifiant.signature HMAC</Text>
      <TextInput
        accessibilityLabel="Code de billet"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setManualCode}
        placeholder="Coller le code du pass"
        style={styles.input}
        value={manualCode}
      />
      <Pressable
        accessibilityRole="button"
        disabled={isProcessing || !manualCode.trim() || !selectedEventId}
        onPress={() => {
          const code = manualCode;
          setManualCode("");
          void validateCode(code);
        }}
        style={[styles.button, (isProcessing || !manualCode.trim()) && styles.disabled]}
      >
        <Text style={styles.buttonText}>Valider le code</Text>
      </Pressable>
      <Text style={styles.disclaimer}>
        Les billets d’événements non organisés par votre compte sont rejetés par le serveur.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#f8fafc", flexGrow: 1, padding: 18, paddingBottom: 112, paddingTop: 58 },
  center: { alignItems: "center", backgroundColor: "#f8fafc", flex: 1, justifyContent: "center" },
  back: { color: "#2563eb", fontSize: 14, fontWeight: "600" },
  title: { color: "#172b4d", fontSize: 25, fontWeight: "800", marginTop: 18 },
  counter: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 12, borderWidth: 1, marginTop: 15, padding: 14 },
  counterLabel: { color: "#64748b", fontSize: 12 },
  counterValue: { color: "#172b4d", fontSize: 32, fontWeight: "800", marginTop: 3 },
  eventList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  eventChoice: { backgroundColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  selectedEvent: { backgroundColor: "#2563eb" },
  eventChoiceText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  selectedEventText: { color: "#ffffff" },
  permission: { alignItems: "center", paddingVertical: 30 },
  cameraFrame: { backgroundColor: "#0f172a", borderRadius: 14, height: 330, marginTop: 16, overflow: "hidden" },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  scanBox: { borderColor: "#ffffff", borderRadius: 12, borderWidth: 3, height: 220, width: 220 },
  processing: { alignItems: "center", flexDirection: "row", gap: 9, justifyContent: "center", padding: 13 },
  feedback: { borderRadius: 10, marginTop: 12, padding: 13 },
  success: { backgroundColor: "#dcfce7", borderColor: "#4ade80", borderWidth: 1 },
  failure: { backgroundColor: "#fee2e2", borderColor: "#f87171", borderWidth: 1 },
  feedbackTitle: { color: "#172b4d", fontSize: 15, fontWeight: "800", textAlign: "center" },
  feedbackText: { color: "#334155", fontSize: 12, marginTop: 5, textAlign: "center" },
  sectionTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700", marginTop: 21 },
  help: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 7 },
  error: { color: "#b91c1c", fontSize: 12, marginTop: 8 },
  input: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 9, borderWidth: 1, color: "#172b4d", marginTop: 10, minHeight: 45, paddingHorizontal: 11 },
  button: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 9, justifyContent: "center", marginTop: 11, minHeight: 46 },
  buttonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  disclaimer: { color: "#64748b", fontSize: 11, lineHeight: 16, marginTop: 14 },
});
