import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Mic, MicOff, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useVoiceAssistant } from "../context/VoiceAssistantContext";
import {
  parseVoiceCommand,
  speechErrorMessage,
  VOICE_CONTEXTUAL_STRINGS,
  type VoiceCommand,
} from "../services/voiceAssistant";

type VoiceAssistantModalProps = {
  onNavigate: (command: VoiceCommand) => boolean;
};

export default function VoiceAssistantModal({
  onNavigate,
}: VoiceAssistantModalProps) {
  const { isOffline } = useAuth();
  const { clearActiveInput, insertIntoFocusedInput } = useVoiceAssistant();
  const [isVisible, setIsVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pendingSosCommand, setPendingSosCommand] =
    useState<VoiceCommand | null>(null);
  const waveValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const startRequestRef = useRef(0);
  const isVisibleRef = useRef(false);

  useSpeechRecognitionEvent("start", () => {
    if (!isVisibleRef.current) return;
    setIsListening(true);
    setError("");
  });
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (!isVisibleRef.current) return;
    if (!event.isFinal) return;
    const text = event.results[0]?.transcript?.trim();
    if (!text) return;
    setTranscript(text);
    processTranscript(text);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!isVisibleRef.current) return;
    setIsListening(false);
    const message = speechErrorMessage(event.error, isOffline);
    setError(message);
    setFeedback(message);
    speak(message);
  });

  useEffect(() => {
    if (!isListening) {
      waveValues.forEach((value) => value.setValue(0));
      return;
    }

    const animations = waveValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 100),
          Animated.timing(value, {
            duration: 400,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            duration: 400,
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [isListening, waveValues]);

  useEffect(
    () => () => {
      startRequestRef.current += 1;
      if (isVisibleRef.current) ExpoSpeechRecognitionModule.abort();
      Speech.stop();
    },
    [],
  );

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, {
      language: "fr-FR",
      onError: () => {
        if (isVisibleRef.current) {
          setError("La synthèse vocale n’est pas disponible sur cet appareil.");
        }
      },
      rate: 0.95,
    });
  }

  function processTranscript(text: string) {
    const command = parseVoiceCommand(text);
    if (command) {
      if (command.requiresSosConfirmation) {
        setPendingSosCommand(command);
        setFeedback(command.feedback);
        speak(command.feedback);
        return;
      }
      if (isOffline && (command.searchText || command.contactQuery)) {
        command.feedback = `${command.feedback} Vous êtes hors ligne ; seuls les résultats déjà chargés sont accessibles.`;
      }
      if (!onNavigate(command)) {
        const result =
          "Finalisez votre profil avant d’utiliser la navigation vocale.";
        setFeedback(result);
        speak(result);
        return;
      }
      setPendingSosCommand(null);
      setFeedback(command.feedback);
      speak(command.feedback);
      return;
    }

    const inserted = insertIntoFocusedInput(text);
    const result = inserted
      ? "Dictée ajoutée au champ sélectionné."
      : "J’ai compris votre dictée. Sélectionnez un champ de saisie pour y insérer le texte.";
    setFeedback(result);
    speak(result);
  }

  async function startListening() {
    const requestId = ++startRequestRef.current;
    isVisibleRef.current = true;
    setError("");
    setTranscript("");
    setFeedback("");
    setPendingSosCommand(null);
    setIsVisible(true);

    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        throw new Error(
          "La reconnaissance vocale n’est pas disponible sur cet appareil.",
        );
      }

      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (requestId !== startRequestRef.current) return;
      if (!permission.granted) {
        throw new Error(speechErrorMessage("not-allowed", isOffline));
      }

      const options = {
        lang: "fr-FR",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        contextualStrings: VOICE_CONTEXTUAL_STRINGS,
      };

      if (isOffline) {
        if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
          throw new Error(speechErrorMessage("service-not-allowed", true));
        }
        const locales = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        if (requestId !== startRequestRef.current) return;
        const hasOfflineFrench = locales.installedLocales.some(
          (locale) => locale.toLocaleLowerCase().startsWith("fr"),
        );
        if (!hasOfflineFrench) {
          throw new Error(speechErrorMessage("service-not-allowed", true));
        }
        ExpoSpeechRecognitionModule.start({
          ...options,
          requiresOnDeviceRecognition: true,
        });
        setFeedback(
          "Mode hors ligne : dictée et commandes locales disponibles avec le modèle français installé.",
        );
      } else {
        ExpoSpeechRecognitionModule.start(options);
      }
    } catch (caughtError) {
      if (requestId !== startRequestRef.current) return;
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible de démarrer la reconnaissance vocale.";
      setError(message);
      setFeedback(message);
      speak(message);
    }
  }

  function stopListening() {
    ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
  }

  function close() {
    startRequestRef.current += 1;
    isVisibleRef.current = false;
    ExpoSpeechRecognitionModule.abort();
    Speech.stop();
    clearActiveInput();
    setIsListening(false);
    setIsVisible(false);
    setPendingSosCommand(null);
  }

  function confirmSos() {
    if (!pendingSosCommand) return;
    const command = pendingSosCommand;
    setPendingSosCommand(null);
    if (!onNavigate(command)) {
      const result =
        "Finalisez votre profil avant d’ouvrir les commandes SOS.";
      setFeedback(result);
      speak(result);
      return;
    }
    const confirmation =
      "J’ouvre le panneau SOS. Choisissez le type d’urgence et confirmez l’envoi dans l’écran.";
    setFeedback(confirmation);
    speak(confirmation);
  }

  return (
    <>
      <Pressable
        accessibilityLabel="Ouvrir l’assistant vocal"
        accessibilityHint="Dicter du texte ou exécuter une commande vocale."
        accessibilityRole="button"
        onPress={() => void startListening()}
        style={styles.floatingButton}
      >
        <Mic color="#ffffff" size={22} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={isVisible}
      >
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <View style={styles.header}>
              <View style={styles.titleGroup}>
                <Text style={styles.title}>Assistant vocal</Text>
                <Text style={styles.subtitle}>
                  Dictez dans un champ ou donnez une commande
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Fermer l’assistant vocal"
                accessibilityRole="button"
                onPress={close}
                style={styles.closeButton}
              >
                <X color="#475569" size={21} />
              </Pressable>
            </View>

            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.listeningPanel,
                isListening && styles.listeningPanelActive,
              ]}
            >
              <View style={styles.waveform}>
                {waveValues.map((value, index) => (
                  <Animated.View
                    key={index}
                    style={[
                      styles.waveBar,
                      {
                        opacity: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 1],
                        }),
                        transform: [
                          {
                            scaleY: value.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.55, 1.5],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.listeningText}>
                {isListening ? "Je vous écoute…" : "Microphone en pause"}
              </Text>
            </View>

            {transcript ? (
              <View style={styles.transcriptPanel}>
                <Text style={styles.panelLabel}>Compris</Text>
                <Text accessibilityRole="text" style={styles.transcript}>
                  « {transcript} »
                </Text>
              </View>
            ) : null}
            {feedback ? (
              <Text accessibilityLiveRegion="polite" style={styles.feedback}>
                {feedback}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {pendingSosCommand ? (
              <View style={styles.confirmationPanel}>
                <Text style={styles.confirmationTitle}>Confirmer l’accès SOS</Text>
                <Text style={styles.confirmationText}>
                  Cela ouvre les commandes d’urgence. L’alerte ne partira pas sans
                  une autre confirmation.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPendingSosCommand(null)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={confirmSos}
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmButtonText}>Ouvrir SOS</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.offlineNote}>
                {isOffline
                  ? "Hors ligne : la dictée exige un modèle français installé sur l’appareil."
                  : "Les commandes locales fonctionnent sans connexion."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={
                  isListening ? stopListening : () => void startListening()
                }
                style={[
                  styles.listenButton,
                  isListening && styles.stopButton,
                ]}
              >
                {isListening ? (
                  <MicOff color="#ffffff" size={18} />
                ) : (
                  <Mic color="#ffffff" size={18} />
                )}
                <Text style={styles.listenButtonText}>
                  {isListening ? "Arrêter" : "Réessayer"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderColor: "#ffffff",
    borderRadius: 30,
    borderWidth: 2,
    bottom: 82,
    elevation: 8,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    width: 56,
    zIndex: 20,
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  dialog: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    gap: 16,
    maxWidth: 480,
    padding: 22,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleGroup: { flex: 1, gap: 4 },
  title: { color: "#0f172a", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 13 },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  listeningPanel: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    flexDirection: "row",
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 18,
  },
  listeningPanelActive: { backgroundColor: "#eff6ff" },
  waveform: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    height: 25,
  },
  waveBar: {
    backgroundColor: "#2563eb",
    borderRadius: 2,
    height: 16,
    width: 4,
  },
  listeningText: { color: "#1e293b", fontSize: 15, fontWeight: "600" },
  transcriptPanel: {
    backgroundColor: "#f8fafc",
    borderLeftColor: "#2563eb",
    borderLeftWidth: 3,
    gap: 5,
    padding: 12,
  },
  panelLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  transcript: { color: "#0f172a", fontSize: 15, lineHeight: 21 },
  feedback: { color: "#1d4ed8", fontSize: 14, lineHeight: 20 },
  error: { color: "#b91c1c", fontSize: 14, lineHeight: 20 },
  confirmationPanel: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  confirmationTitle: { color: "#9a3412", fontSize: 15, fontWeight: "700" },
  confirmationText: { color: "#7c2d12", fontSize: 13, lineHeight: 18 },
  confirmationActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  cancelButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
  },
  cancelButtonText: { color: "#334155", fontSize: 14, fontWeight: "600" },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
  },
  confirmButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  footer: { alignItems: "center", gap: 14 },
  offlineNote: { color: "#64748b", fontSize: 12, lineHeight: 17 },
  listenButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    width: "100%",
  },
  stopButton: { backgroundColor: "#475569" },
  listenButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
