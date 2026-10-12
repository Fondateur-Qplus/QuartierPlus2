import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as SecureStore from "expo-secure-store";
import { Mic, MicOff, X } from "lucide-react-native";
import { useEffect, useReducer, useRef, useState } from "react";
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
import { callOfficialEmergencyService } from "../services/emergencyServices";
import { openProfileStore } from "../storage/profileStore";
import {
  isVoiceCancellation,
  isVoiceConfirmation,
  parseVoiceCommand,
  speechErrorMessage,
  VOICE_CONTEXTUAL_STRINGS,
  VOICE_COMMAND_EXAMPLES,
  type VoiceCommand,
} from "../services/voiceAssistant";
import {
  transitionVoiceAssistant,
  type VoiceAssistantEvent,
} from "../services/voiceAssistantState";

const PERMISSION_EXPLANATION_KEY = "quartierplus.voice-permission-explained";
const PERMISSION_REQUESTED_KEY = "quartierplus.voice-permission-requested";
const SOS_CONFIRMATION_SECONDS = 5;

class VoiceAssistantStartError extends Error {
  constructor(
    readonly state: VoiceAssistantEvent,
    message: string,
  ) {
    super(message);
  }
}

type VoiceAssistantModalProps = {
  onNavigate: (command: VoiceCommand) => boolean;
};

export default function VoiceAssistantModal({
  onNavigate,
}: VoiceAssistantModalProps) {
  const { isOffline, user } = useAuth();
  const {
    clearActiveInput,
    insertIntoFocusedInput,
    recognitionAvailable,
    registerAssistantHandler,
    registerDictationHandler,
    setAssistantActive,
    setRecognitionAvailable,
  } = useVoiceAssistant();
  const [machineState, dispatchVoiceEvent] = useReducer(
    transitionVoiceAssistant,
    "idle",
  );
  const isListening = machineState === "listening";
  const [isVisible, setIsVisible] = useState(false);
  const [permissionExplanationVisible, setPermissionExplanationVisible] =
    useState(false);
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [technicalDetails, setTechnicalDetails] = useState("");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [pendingSosCommand, setPendingSosCommand] =
    useState<VoiceCommand | null>(null);
  const waveValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const startRequestRef = useRef(0);
  const isVisibleRef = useRef(false);
  const dictationOnlyRef = useRef(false);
  const pendingSosCommandRef = useRef<VoiceCommand | null>(null);
  const sosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechLanguageRef = useRef("fr-FR");

  useEffect(
    () =>
      registerDictationHandler(() => {
        void startListening("dictation");
      }),
    [registerDictationHandler],
  );

  useEffect(
    () =>
      registerAssistantHandler(() => {
        void startListening("command");
      }),
    [registerAssistantHandler],
  );

  useSpeechRecognitionEvent("start", () => {
    if (!isVisibleRef.current) return;
    dispatchVoiceEvent("start");
    setError("");
  });
  useSpeechRecognitionEvent("end", () => dispatchVoiceEvent("stop"));
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
    dispatchVoiceEvent(
      event.error === "not-allowed"
        ? "permission-denied"
        : event.error === "language-not-supported"
          ? "language-unsupported"
          : event.error === "service-not-allowed"
            ? "service-unavailable"
            : "error",
    );
    const message = speechErrorMessage(event.error, isOffline);
    setError(message);
    setTechnicalDetails(`Code de reconnaissance vocale : ${event.error}`);
    setShowTechnicalDetails(false);
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
      if (sosTimerRef.current) clearInterval(sosTimerRef.current);
      if (isVisibleRef.current) ExpoSpeechRecognitionModule.abort();
      Speech.stop();
    },
    [],
  );

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, {
      language: speechLanguageRef.current,
      onError: () => {
        if (isVisibleRef.current) {
          setError("La synthèse vocale n’est pas disponible sur cet appareil.");
        }
      },
      rate: 0.95,
    });
  }

  function processTranscript(text: string) {
    const pendingSos = pendingSosCommandRef.current;
    if (pendingSos) {
      if (isVoiceCancellation(text)) {
        cancelSosConfirmation();
      } else if (isVoiceConfirmation(text)) {
        beginSosCountdown();
      } else {
        const result =
          "Pour continuer, dites « confirmer » ou appuyez sur Confirmer. Dites « annuler » pour arrêter.";
        setFeedback(result);
        speak(result);
      }
      return;
    }

    const command = dictationOnlyRef.current ? null : parseVoiceCommand(text);
    if (command) {
      if (command.requiresSosConfirmation) {
        pendingSosCommandRef.current = command;
        setPendingSosCommand(command);
        setFeedback(command.feedback);
        speak(command.feedback);
        return;
      }
      if (command.emergencyService) {
        void callOfficialEmergencyService(command.emergencyService)
          .then(() => {
            const result =
              "Le téléphone est prêt. Confirmez l’appel dans l’application Téléphone.";
            setFeedback(result);
            speak(result);
          })
          .catch(() => {
            const result =
              "Impossible d’ouvrir l’appel. Vérifiez le numéro d’urgence du pays dans votre profil.";
            setError(result);
            setFeedback(result);
            speak(result);
          });
        return;
      }
      if (isOffline && (command.searchText || command.contactQuery)) {
        command.feedback = `${command.feedback} Vous êtes hors ligne ; seuls les résultats déjà chargés sont accessibles.`;
      }
      if (!onNavigate(command)) {
        const result =
          "Connectez-vous ou finalisez votre profil avant d’utiliser cette action.";
        setFeedback(result);
        speak(result);
        return;
      }
      if (command.requiresAuthentication && !user) {
        const result = "Connectez-vous pour continuer cette action.";
        setFeedback(result);
        speak(result);
        return;
      }
      if (
        command.requiresAuthentication &&
        user &&
        (typeof user.name !== "string" || !user.name.trim())
      ) {
        const result = "Finalisez votre profil pour continuer cette action.";
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
      : `Commande inconnue. Essayez : ${VOICE_COMMAND_EXAMPLES.join(", ")}.`;
    setFeedback(result);
    speak(result);
  }

  async function startListening(mode: "command" | "dictation" = "command") {
    const requestId = ++startRequestRef.current;
    dictationOnlyRef.current = mode === "dictation";
    isVisibleRef.current = true;
    setError("");
    setTechnicalDetails("");
    setShowTechnicalDetails(false);
    setTranscript("");
    setFeedback("");
    setAssistantActive(true);
    setIsVisible(true);
    dispatchVoiceEvent("activate");

    let available = recognitionAvailable;
    if (available === null) {
      try {
        available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
        setRecognitionAvailable(available);
      } catch (availabilityError) {
        available = false;
        setRecognitionAvailable(false);
        console.error("Unable to initialize speech recognition:", availabilityError);
      }
    }
    if (!available) {
      dispatchVoiceEvent("service-unavailable");
      const message = speechErrorMessage("service-not-allowed", isOffline);
      setError(message);
      setFeedback(message);
      setTechnicalDetails("Le service de reconnaissance vocale est indisponible.");
      return;
    }
    dispatchVoiceEvent("ready");

    try {
      const profileStore = await openProfileStore();
      const preferences = await profileStore.getPreferences();
      if (requestId !== startRequestRef.current) return;
      speechLanguageRef.current =
        preferences.language === "en" ? "en-US" : "fr-FR";

      const explanationSeen = await SecureStore.getItemAsync(
        PERMISSION_EXPLANATION_KEY,
      );
      if (requestId !== startRequestRef.current) return;
      if (explanationSeen !== "true") {
        setPermissionExplanationVisible(true);
        return;
      }

      await beginListening(requestId);
    } catch (caughtError) {
      if (requestId !== startRequestRef.current) return;
      console.error("Unable to prepare voice assistant:", caughtError);
      const message = "Impossible de préparer la permission du microphone.";
      setError(message);
      setFeedback(message);
      setTechnicalDetails("Échec de lecture des préférences vocales ou de confidentialité.");
      dispatchVoiceEvent("error");
    }
  }

  async function continueAfterPermissionExplanation() {
    setPermissionExplanationVisible(false);
    const requestId = startRequestRef.current;
    try {
      await SecureStore.setItemAsync(PERMISSION_EXPLANATION_KEY, "true");
      if (requestId !== startRequestRef.current) return;
      await beginListening(requestId, speechLanguageRef.current);
    } catch (caughtError) {
      console.error("Unable to save voice privacy choice:", caughtError);
      const message = "Impossible d’enregistrer votre choix de confidentialité.";
      setError(message);
      setFeedback(message);
      setTechnicalDetails("Échec d’enregistrement du choix de confidentialité.");
      dispatchVoiceEvent("error");
    }
  }

  async function beginListening(
    requestId: number,
    language = speechLanguageRef.current,
  ) {
    try {
      const currentPermission =
        await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (requestId !== startRequestRef.current) return;
      let permission = currentPermission;
      if (!permission.granted) {
        const requestAlreadyMade = await SecureStore.getItemAsync(
          PERMISSION_REQUESTED_KEY,
        );
        if (requestId !== startRequestRef.current) return;
        if (requestAlreadyMade === "true") {
          throw new VoiceAssistantStartError(
            "permission-denied",
            speechErrorMessage("not-allowed", isOffline),
          );
        }
        await SecureStore.setItemAsync(PERMISSION_REQUESTED_KEY, "true");
        if (requestId !== startRequestRef.current) return;
        permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }
      if (requestId !== startRequestRef.current) return;
      if (!permission.granted) {
        throw new VoiceAssistantStartError(
          "permission-denied",
          speechErrorMessage("not-allowed", isOffline),
        );
      }

      const options = {
        lang: language,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        contextualStrings: VOICE_CONTEXTUAL_STRINGS,
      };

      if (isOffline) {
        if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
          throw new VoiceAssistantStartError(
            "service-unavailable",
            speechErrorMessage("service-not-allowed", true),
          );
        }
        const locales = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        if (requestId !== startRequestRef.current) return;
        const hasOfflineFrench = locales.installedLocales.some(
          (locale) =>
            locale
              .toLocaleLowerCase()
              .startsWith(language.slice(0, 2).toLowerCase()),
        );
        if (!hasOfflineFrench) {
          throw new VoiceAssistantStartError(
            "language-unsupported",
            speechErrorMessage("language-not-supported", true),
          );
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
      if (caughtError instanceof VoiceAssistantStartError) {
        dispatchVoiceEvent(caughtError.state);
        setTechnicalDetails(
          `État de reconnaissance vocale : ${caughtError.state}`,
        );
      } else {
        setTechnicalDetails(
          caughtError instanceof Error
            ? `${caughtError.name}: ${caughtError.message}`
            : "Erreur vocale non détaillée.",
        );
        dispatchVoiceEvent("error");
      }
      setError(message);
      setFeedback(message);
      speak(message);
    }
  }

  function stopListening() {
    ExpoSpeechRecognitionModule.stop();
    dispatchVoiceEvent("stop");
  }

  function close() {
    startRequestRef.current += 1;
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    sosTimerRef.current = null;
    isVisibleRef.current = false;
    setAssistantActive(false);
    ExpoSpeechRecognitionModule.abort();
    Speech.stop();
    clearActiveInput();
    dispatchVoiceEvent("reset");
    setIsVisible(false);
    setPermissionExplanationVisible(false);
    setSosCountdown(null);
    pendingSosCommandRef.current = null;
    setPendingSosCommand(null);
  }

  function confirmSos() {
    beginSosCountdown();
  }

  function beginSosCountdown() {
    if (!pendingSosCommandRef.current || sosTimerRef.current) return;
    let remaining = SOS_CONFIRMATION_SECONDS;
    setSosCountdown(remaining);
    sosTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setSosCountdown(remaining);
        return;
      }
      if (sosTimerRef.current) clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
      setSosCountdown(null);
      void openConfirmedSos();
    }, 1000);
  }

  function cancelSosConfirmation() {
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    sosTimerRef.current = null;
    setSosCountdown(null);
    pendingSosCommandRef.current = null;
    setPendingSosCommand(null);
    const result = "Demande SOS annulée.";
    setFeedback(result);
    speak(result);
  }

  async function openConfirmedSos() {
    const command = pendingSosCommandRef.current;
    if (!command) return;
    pendingSosCommandRef.current = null;
    setPendingSosCommand(null);
    if (!onNavigate(command)) {
      const result =
        "Connectez-vous ou finalisez votre profil pour lancer une alerte SOS.";
      setFeedback(result);
      speak(result);
      return;
    }
    if (!user) {
      const result = "Connectez-vous pour lancer une alerte SOS.";
      setFeedback(result);
      speak(result);
      return;
    }
    if (typeof user.name !== "string" || !user.name.trim()) {
      const result = "Finalisez votre profil pour lancer une alerte SOS.";
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
      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={isVisible}
      >
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.dialog}>
            {permissionExplanationVisible ? (
              <>
                <Text style={styles.title}>Avant d’activer le microphone</Text>
                <Text style={styles.confirmationText}>
                  QuartierPlus utilise la reconnaissance vocale du téléphone
                  uniquement après votre action. L’application ne stocke pas
                  l’audio et ne l’envoie pas à QuartierPlus. L’accès au
                  microphone est demandé au premier usage; si vous le refusez,
                  vous pourrez l’autoriser dans les réglages de l’appareil.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={close}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void continueAfterPermissionExplanation()}
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmButtonText}>Continuer</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
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
              <>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
                {technicalDetails ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showTechnicalDetails }}
                      onPress={() =>
                        setShowTechnicalDetails((visible) => !visible)
                      }
                    >
                      <Text style={styles.detailsToggle}>
                        {showTechnicalDetails
                          ? "Masquer les détails techniques"
                          : "Détails techniques"}
                      </Text>
                    </Pressable>
                    {showTechnicalDetails ? (
                      <Text selectable style={styles.technicalDetails}>
                        {technicalDetails}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {pendingSosCommand ? (
              <View style={styles.confirmationPanel}>
                <Text style={styles.confirmationTitle}>
                  {sosCountdown === null
                    ? "Confirmer le lancement SOS"
                    : `Lancement dans ${sosCountdown} seconde${sosCountdown === 1 ? "" : "s"}`}
                </Text>
                <Text style={styles.confirmationText}>
                  L’alerte ne part qu’après ce compte à rebours annulable et la
                  confirmation finale dans l’écran SOS.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={cancelSosConfirmation}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={confirmSos}
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmButtonText}>
                      {sosCountdown === null ? "Confirmer" : "Confirmer"}
                    </Text>
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
                  isListening
                    ? stopListening
                    : () => void startListening("command")
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
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  detailsToggle: { color: "#475569", fontSize: 12, textDecorationLine: "underline" },
  technicalDetails: { color: "#64748b", fontSize: 11, lineHeight: 16 },
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
