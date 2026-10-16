import {
  Bot,
  Calendar,
  Download,
  Heart,
  MapPin,
  MessageCircle,
  Mic,
  Plus,
  Radio,
  Share2,
  ShoppingBag,
  Sparkles,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { MainTabParamList } from "../navigation/types";
import VoiceTextInput from "../components/VoiceTextInput";
import { useTheme } from "../context/ThemeContext";

type Scope = "quartier" | "pays" | "monde";
type ActiveModal = "comments" | "share" | "live" | "assistant" | null;

const SCOPES: { id: Scope; label: string }[] = [
  { id: "quartier", label: "Mon Quartier (0-30km)" },
  { id: "pays", label: "Mon Pays (0-100km+)" },
  { id: "monde", label: "Monde" },
];

const SUBTITLES = [
  "Un beau moment partagé avec le quartier aujourd'hui.",
  "La vie locale, racontée par celles et ceux qui la font.",
  "Restons solidaires et veillons les uns sur les autres.",
];

const ASSISTANT_SUGGESTIONS = [
  "Ouvre le Grin du quartier",
  "Affiche le canal Urgences",
  "Va sur le Marché",
];

export default function HomeScreen() {
  const { colors } = useTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [scope, setScope] = useState<Scope>("quartier");
  const [isPureImmersion, setIsPureImmersion] = useState(false);
  const [isAllied, setIsAllied] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(1400);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([
    "Quel beau partage ! ❤️",
    "La solidarité commence ici.",
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [assistantCommand, setAssistantCommand] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [isAssistantListening, setIsAssistantListening] = useState(false);
  const [isAssistantProcessing, setIsAssistantProcessing] = useState(false);
  const assistantPulse = useRef(new Animated.Value(1)).current;
  const lastVideoTap = useRef(0);
  const assistantTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setSubtitleIndex((current) => (current + 1) % SUBTITLES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (assistantTimer.current) clearTimeout(assistantTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!isAssistantListening) {
      assistantPulse.stopAnimation();
      assistantPulse.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(assistantPulse, {
          duration: 650,
          toValue: 1.12,
          useNativeDriver: true,
        }),
        Animated.timing(assistantPulse, {
          duration: 650,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [assistantPulse, isAssistantListening]);

  const scopePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 35 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          const currentIndex = SCOPES.findIndex((item) => item.id === scope);
          const nextIndex = Math.max(
            0,
            Math.min(
              SCOPES.length - 1,
              currentIndex + (gesture.dx < 0 ? 1 : -1),
            ),
          );
          setScope(SCOPES[nextIndex].id);
        },
      }),
    [scope],
  );

  const likePost = (forceLike = false) => {
    const nextLiked = forceLike ? true : !isLiked;
    if (nextLiked !== isLiked) {
      setLikeCount((count) => count + (nextLiked ? 1 : -1));
    }
    setIsLiked(nextLiked);
  };

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastVideoTap.current < 320) {
      likePost(true);
    }
    lastVideoTap.current = now;
  };

  const saveVideo = () => {
    setIsSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setIsSaved(false), 2600);
  };

  const submitComment = () => {
    const trimmedComment = comment.trim();
    if (!trimmedComment) return;
    setComments((current) => [trimmedComment, ...current]);
    setComment("");
    setIsRecording(false);
  };

  const startAssistantCommand = (command: string) => {
    if (assistantTimer.current) clearTimeout(assistantTimer.current);
    setAssistantCommand(command);
    setAssistantResponse("");
    setIsAssistantListening(false);
    setIsAssistantProcessing(true);
    assistantTimer.current = setTimeout(() => {
      setIsAssistantProcessing(false);
      setAssistantResponse(
        command.includes("Grin")
          ? "Le Grin du quartier est prêt à vous accueillir."
          : command.includes("Urgences")
            ? "Le canal Urgences est affiché."
            : "Le Marché de votre quartier est ouvert.",
      );
    }, 1100);
  };

  const marketAction = scope === "quartier";
  const formattedLikeCount =
    likeCount >= 1000
      ? `${(likeCount / 1000).toFixed(1).replace(".", ",")}k`
      : String(likeCount);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.videoBackdrop}>
        <View style={styles.backdropGlow} />
        <View style={styles.sun} />
        <View style={styles.horizon} />
        <View style={[styles.building, styles.buildingOne]} />
        <View style={[styles.building, styles.buildingTwo]} />
        <View style={[styles.building, styles.buildingThree]} />
        <View style={styles.street} />
      </View>

      <Pressable
        accessibilityHint="Touchez deux fois pour aimer, ou maintenez pour masquer les commandes."
        accessibilityLabel="Vidéo communautaire"
        accessibilityRole="button"
        delayLongPress={420}
        onLongPress={() => setIsPureImmersion((current) => !current)}
        onPress={handleVideoTap}
        style={styles.videoGestureSurface}
        {...scopePanResponder.panHandlers}
      />

      {!isPureImmersion && (
        <>
          <View pointerEvents="none" style={styles.videoLabel}>
            <Volume2 color="#ffffff" size={15} />
            <Text style={styles.videoLabelText}>VIDÉO COMMUNAUTAIRE</Text>
          </View>

          <View style={styles.topOverlay}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scopeScroll}
              contentContainerStyle={styles.scopeTabs}
            >
              {SCOPES.map((item) => {
                const selected = scope === item.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={item.id}
                    onPress={() => setScope(item.id)}
                    style={styles.scopeTab}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.scopeTabText,
                        selected && styles.scopeTabTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {selected && <View style={styles.activeTabIndicator} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View pointerEvents="none" style={styles.centerWatermark}>
            <Text style={styles.watermarkText}>+</Text>
          </View>

          <View style={styles.actionRail}>
            <View style={styles.authorAvatarSmall}>
              <Text style={styles.avatarInitial}>A</Text>
            </View>
            <Pressable
              accessibilityLabel={isAllied ? "Désallier" : "S'allier"}
              accessibilityRole="button"
              accessibilityState={{ selected: isAllied }}
              onPress={() => setIsAllied((current) => !current)}
              style={styles.allyAction}
            >
              {isAllied ? (
                <UserCheck color="#ffffff" size={24} />
              ) : (
                <UserPlus color="#ffffff" size={24} />
              )}
              <Text style={styles.actionLabel}>
                {isAllied ? "Allié·e" : "S'allier"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="J'adore"
              accessibilityRole="button"
              accessibilityState={{ selected: isLiked }}
              onPress={() => likePost()}
              style={styles.actionButton}
            >
              <Heart
                color={isLiked ? "#fb7185" : "#ffffff"}
                fill={isLiked ? "#fb7185" : "transparent"}
                size={29}
                strokeWidth={2.2}
              />
              <Text style={styles.actionLabel}>J'adore</Text>
              <Text style={styles.actionCount}>{formattedLikeCount}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Réagir"
              accessibilityRole="button"
              onPress={() => setActiveModal("comments")}
              style={styles.actionButton}
            >
              <MessageCircle color="#ffffff" size={28} strokeWidth={2.1} />
              <Text style={styles.actionLabel}>Réagir</Text>
              <Text style={styles.actionCount}>{comments.length + 84}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Propager"
              accessibilityRole="button"
              onPress={() => setActiveModal("share")}
              style={styles.actionButton}
            >
              <Share2 color="#ffffff" size={27} strokeWidth={2.1} />
              <Text style={styles.actionLabel}>Propager</Text>
              <Text style={styles.actionCount}>32</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Télécharger"
              accessibilityRole="button"
              onPress={saveVideo}
              style={styles.actionButton}
            >
              <Download color="#ffffff" size={26} strokeWidth={2.1} />
              <Text style={styles.actionLabel}>Télécharger</Text>
            </Pressable>
          </View>

          <View style={styles.publicationInfo}>
            <View style={styles.authorNameRow}>
              <View style={styles.authorAvatar}>
                <Text style={styles.avatarInitial}>A</Text>
              </View>
              <View style={styles.authorDetails}>
                <Text style={styles.proximity}>📍 À 1.2 km de vous</Text>
                <Text style={styles.authorName}>@aminata.d</Text>
              </View>
              <Pressable
                accessibilityLabel={isMuted ? "Activer le son" : "Couper le son"}
                accessibilityRole="button"
                onPress={() => setIsMuted((current) => !current)}
                style={styles.soundButton}
              >
                {isMuted ? (
                  <VolumeX color="#ffffff" size={18} />
                ) : (
                  <Volume2 color="#ffffff" size={18} />
                )}
              </Pressable>
            </View>
            <Text numberOfLines={2} style={styles.caption}>
              {scope === "quartier"
                ? "Belle matinée dans le quartier ! Restons solidaires et veillons les uns sur les autres. #QuartierPlus"
                : scope === "pays"
                  ? "Les belles histoires de nos régions, partagées ensemble. #QuartierPlus"
                  : "Un beau moment partagé avec la communauté. #QuartierPlus"}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  marketAction ? "Marché du quartier" : "Fiche événement",
                  marketAction
                    ? "Découvrez les offres disponibles près de vous."
                    : "Consultez les détails et les prochains événements.",
                )
              }
              style={styles.quickAction}
            >
              {marketAction ? (
                <ShoppingBag color="#ffffff" size={15} />
              ) : (
                <Calendar color="#ffffff" size={15} />
              )}
              <Text numberOfLines={1} style={styles.quickActionText}>
                {marketAction
                  ? "Offre disponible sur le Marché"
                  : "Voir la fiche Événement"}
              </Text>
            </Pressable>
            <View style={styles.subtitleRow}>
              <Sparkles color="#a7f3d0" size={14} />
              <Text numberOfLines={1} style={styles.subtitleText}>
                Sous-titres IA · {SUBTITLES[subtitleIndex]}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel="Lancer un Live : Grin du quartier"
            accessibilityRole="button"
            onPress={() => setActiveModal("live")}
            style={styles.liveButton}
          >
            <Radio color="#ffffff" size={17} />
            <Text style={styles.liveButtonText}>Grin du quartier</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Créer une annonce avec photo"
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("Marche", {
                voiceRequestId: `quick-create-${Date.now()}`,
                voiceCreateListing: true,
              })
            }
            style={styles.createFab}
          >
            <Plus color="#ffffff" size={27} strokeWidth={2.5} />
          </Pressable>

          {isSaved && (
            <View accessibilityLiveRegion="polite" style={styles.savedToast}>
              <Download color="#ffffff" size={17} />
              <Text style={styles.savedToastText}>Enregistrée dans la galerie</Text>
            </View>
          )}
        </>
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
        transparent
        visible={activeModal !== null}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Fermer"
            onPress={() => setActiveModal(null)}
            style={styles.modalScrim}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheetKeyboardAvoiding}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              {activeModal === "comments" && (
                <>
                  <Text style={styles.sheetTitle}>Réagir à la vidéo</Text>
                  <View style={styles.reactionRow}>
                    {["❤️", "👏", "😂", "🙏", "🔥"].map((reaction) => (
                      <Pressable
                        accessibilityLabel={`Réagir ${reaction}`}
                        accessibilityRole="button"
                        key={reaction}
                        onPress={() => {
                          setComments((current) => [`${reaction} · Vous`, ...current]);
                          setActiveModal(null);
                        }}
                        style={styles.reactionButton}
                      >
                        <Text style={styles.reactionEmoji}>{reaction}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={styles.commentsList}
                  >
                    {comments.map((item, index) => (
                      <View key={`${index}-${item}`} style={styles.commentItem}>
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>
                            {index === 0 ? "V" : "Q"}
                          </Text>
                        </View>
                        <Text style={styles.commentText}>{item}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.commentComposer}>
                    <VoiceTextInput
                      accessibilityLabel="Votre commentaire"
                      onChangeText={setComment}
                      onSubmitEditing={submitComment}
                      placeholder="Ajouter un commentaire..."
                      placeholderTextColor="#94a3b8"
                      returnKeyType="send"
                      style={styles.commentInput}
                      value={comment}
                    />
                    <Pressable
                      accessibilityLabel={isRecording ? "Arrêter le micro" : "Commenter avec le micro"}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isRecording }}
                      onPress={() => {
                        setIsRecording((current) => !current);
                        if (!isRecording) setComment("Votre message vocal");
                      }}
                      style={[styles.micButton, isRecording && styles.micButtonActive]}
                    >
                      <Mic color="#ffffff" size={19} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Envoyer le commentaire"
                      accessibilityRole="button"
                      onPress={submitComment}
                      style={styles.sendButton}
                    >
                      <Text style={styles.sendButtonText}>Envoyer</Text>
                    </Pressable>
                  </View>
                  {isRecording && (
                    <Text style={styles.recordingLabel}>● Enregistrement vocal simulé</Text>
                  )}
                </>
              )}

              {activeModal === "share" && (
                <>
                  <Text style={styles.sheetTitle}>Propager cette vidéo</Text>
                  <Text style={styles.sheetDescription}>
                    Faites circuler ce moment dans votre communauté.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActiveModal(null);
                      Alert.alert("Partagé", "La vidéo a été propagée dans le quartier.");
                    }}
                    style={styles.shareOption}
                  >
                    <MapPin color="#34d399" size={21} />
                    <View style={styles.shareOptionCopy}>
                      <Text style={styles.shareOptionTitle}>Dans le quartier</Text>
                      <Text style={styles.shareOptionSubtitle}>Partager avec les voisins</Text>
                    </View>
                    <Share2 color="#cbd5e1" size={19} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActiveModal(null);
                      Alert.alert(
                        "Réseaux sociaux",
                        "La feuille de partage de votre appareil sera bientôt disponible.",
                      );
                    }}
                    style={styles.shareOption}
                  >
                    <Share2 color="#60a5fa" size={21} />
                    <View style={styles.shareOptionCopy}>
                      <Text style={styles.shareOptionTitle}>Réseaux sociaux</Text>
                      <Text style={styles.shareOptionSubtitle}>Copier ou envoyer le lien</Text>
                    </View>
                    <Share2 color="#cbd5e1" size={19} />
                  </Pressable>
                </>
              )}

              {activeModal === "live" && (
                <>
                  <View style={styles.liveTitleRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.sheetTitle}>Grin du quartier</Text>
                  </View>
                  <Text style={styles.sheetDescription}>
                    Aperçu du Direct · Rejoignez la conversation
                  </Text>
                  <View style={styles.livePreview}>
                    <Radio color="#a7f3d0" size={30} />
                    <Text style={styles.livePreviewTitle}>Le Grin vous attend</Text>
                    <Text style={styles.livePreviewCaption}>
                      Échangez en audio ou en vidéo avec vos voisins.
                    </Text>
                  </View>
                  <Text style={styles.seatsTitle}>Chaises du Grin</Text>
                  <View style={styles.seatGrid}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <Pressable
                        accessibilityLabel={`Rejoindre la chaise ${index + 1}`}
                        accessibilityRole="button"
                        key={index}
                        onPress={() =>
                          Alert.alert(
                            "Chaise du Grin",
                            "La connexion audio/vidéo sera bientôt disponible.",
                          )
                        }
                        style={styles.seat}
                      >
                        <Plus color="#a7f3d0" size={19} />
                        <Text style={styles.seatLabel}>Chaise {index + 1}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActiveModal(null);
                      Alert.alert("Direct", "Votre aperçu du Grin est prêt.");
                    }}
                    style={styles.primaryButton}
                  >
                    <Radio color="#ffffff" size={18} />
                    <Text style={styles.primaryButtonText}>Rejoindre le Direct</Text>
                  </Pressable>
                </>
              )}

              {activeModal === "assistant" && (
                <>
                  <View style={styles.assistantTitleRow}>
                    <Animated.View
                      style={[
                        styles.assistantIcon,
                        {
                          transform: [{ scale: assistantPulse }],
                        },
                      ]}
                    >
                      {isAssistantListening ? (
                        <Mic color="#a7f3d0" size={23} />
                      ) : (
                        <Bot color="#a7f3d0" size={23} />
                      )}
                    </Animated.View>
                    <View>
                      <Text style={styles.sheetTitle}>Assistant Vocal</Text>
                      <Text style={styles.assistantBrand}>QuartierPlus</Text>
                    </View>
                  </View>
                  <View
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.listeningPanel,
                      isAssistantListening && styles.listeningPanelActive,
                    ]}
                  >
                    <Sparkles color="#a7f3d0" size={18} />
                    <Text style={styles.listeningText}>
                      {isAssistantProcessing
                        ? "Je m'en occupe..."
                        : isAssistantListening
                          ? "Je vous écoute..."
                          : assistantResponse || "Que puis-je faire pour vous ?"}
                    </Text>
                  </View>
                  <Text style={styles.suggestionsTitle}>Suggestions</Text>
                  {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                    <Pressable
                      accessibilityRole="button"
                      key={suggestion}
                      onPress={() => startAssistantCommand(suggestion)}
                      style={styles.suggestionButton}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                      <Sparkles color="#a7f3d0" size={16} />
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityLabel={isAssistantListening ? "Arrêter l'écoute" : "Parler à l'assistant"}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isAssistantListening }}
                    onPress={() => {
                      if (isAssistantListening) {
                        startAssistantCommand(
                          assistantCommand || ASSISTANT_SUGGESTIONS[0],
                        );
                      } else {
                        setAssistantResponse("");
                        setIsAssistantListening(true);
                      }
                    }}
                    style={styles.primaryButton}
                  >
                    <Mic color="#ffffff" size={18} />
                    <Text style={styles.primaryButtonText}>
                      {isAssistantListening ? "Terminer l'écoute" : "Parler à l'assistant"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#102a38",
    flex: 1,
    overflow: "hidden",
  },
  videoBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#14505b",
    overflow: "hidden",
  },
  videoGestureSurface: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  backdropGlow: {
    backgroundColor: "#3a7d78",
    borderRadius: 220,
    height: 360,
    opacity: 0.52,
    position: "absolute",
    right: -90,
    top: 110,
    width: 360,
  },
  sun: {
    backgroundColor: "#f3c985",
    borderRadius: 50,
    height: 96,
    opacity: 0.85,
    position: "absolute",
    right: 42,
    top: "24%",
    width: 96,
  },
  horizon: {
    backgroundColor: "#47776c",
    height: "33%",
    left: -40,
    opacity: 0.86,
    position: "absolute",
    right: -40,
    top: "44%",
    transform: [{ rotate: "-5deg" }],
  },
  building: {
    backgroundColor: "#b77c55",
    bottom: "23%",
    opacity: 0.82,
    position: "absolute",
  },
  buildingOne: {
    height: 188,
    left: "8%",
    width: 94,
  },
  buildingTwo: {
    backgroundColor: "#d19a67",
    height: 245,
    left: "35%",
    width: 118,
  },
  buildingThree: {
    backgroundColor: "#936b58",
    height: 160,
    right: "5%",
    width: 104,
  },
  street: {
    backgroundColor: "#344b4b",
    bottom: 0,
    height: "24%",
    left: -60,
    opacity: 0.9,
    position: "absolute",
    right: -60,
    transform: [{ rotate: "4deg" }],
  },
  videoLabel: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    right: 16,
    top: "41%",
    zIndex: 2,
  },
  videoLabelText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  topOverlay: {
    left: 0,
    paddingTop: 52,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  scopeScroll: {
    flexGrow: 0,
  },
  scopeTabs: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 16,
  },
  scopeTab: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  scopeTabText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scopeTabTextSelected: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  activeTabIndicator: {
    backgroundColor: "#ffffff",
    borderRadius: 2,
    bottom: 0,
    height: 3,
    position: "absolute",
    width: 28,
  },
  centerWatermark: {
    alignItems: "center",
    height: 140,
    justifyContent: "center",
    left: "50%",
    marginLeft: -70,
    position: "absolute",
    top: "34%",
    width: 140,
    zIndex: 0,
  },
  watermarkText: {
    color: "rgba(255,255,255,0.10)",
    fontSize: 138,
    fontWeight: "200",
  },
  actionRail: {
    alignItems: "center",
    bottom: 198,
    gap: 18,
    position: "absolute",
    right: 12,
    zIndex: 2,
  },
  authorAvatarSmall: {
    alignItems: "center",
    backgroundColor: "#f1b37a",
    borderColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 2,
    height: 43,
    justifyContent: "center",
    width: 43,
  },
  avatarInitial: {
    color: "#623b2b",
    fontSize: 17,
    fontWeight: "900",
  },
  allyAction: {
    alignItems: "center",
    gap: 4,
  },
  actionButton: {
    alignItems: "center",
    gap: 3,
    minWidth: 52,
  },
  actionLabel: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionCount: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  publicationInfo: {
    bottom: 32,
    left: 16,
    position: "absolute",
    right: 82,
    zIndex: 2,
  },
  authorNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 9,
  },
  authorAvatar: {
    alignItems: "center",
    backgroundColor: "#f1b37a",
    borderColor: "#ffffff",
    borderRadius: 19,
    borderWidth: 1.5,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  authorDetails: {
    flex: 1,
    gap: 2,
  },
  proximity: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  authorName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  soundButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  caption: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 9,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  quickAction: {
    alignSelf: "flex-start",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.66)",
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginBottom: 8,
    maxWidth: "100%",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  quickActionText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  subtitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  subtitleText: {
    color: "#e2e8f0",
    flex: 1,
    fontSize: 10,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveButton: {
    alignItems: "center",
    backgroundColor: "#dc3654",
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: "absolute",
    top: 105,
    zIndex: 2,
  },
  liveButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  createFab: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderColor: "#ffffff",
    borderRadius: 27,
    borderWidth: 2,
    bottom: 51,
    height: 52,
    justifyContent: "center",
    position: "absolute",
    right: 15,
    width: 52,
    zIndex: 2,
  },
  savedToast: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(15,23,42,0.9)",
    borderRadius: 20,
    bottom: 104,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    position: "absolute",
    zIndex: 4,
  },
  savedToastText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  modalRoot: {
    backgroundColor: "rgba(2,6,23,0.4)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
  },
  sheetKeyboardAvoiding: {
    maxHeight: "88%",
  },
  sheet: {
    backgroundColor: "#102331",
    borderColor: "rgba(255,255,255,0.12)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 3,
    height: 4,
    marginBottom: 18,
    width: 42,
  },
  sheetTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
  },
  sheetDescription: {
    color: "#b8c8d4",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 17,
    marginTop: 7,
  },
  reactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  reactionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 23,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  reactionEmoji: {
    fontSize: 22,
  },
  commentsList: {
    maxHeight: 220,
  },
  commentItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  commentAvatar: {
    alignItems: "center",
    backgroundColor: "#25636c",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  commentAvatarText: {
    color: "#d1fae5",
    fontSize: 13,
    fontWeight: "800",
  },
  commentText: {
    color: "#e2e8f0",
    flex: 1,
    fontSize: 13,
  },
  commentComposer: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
    padding: 6,
  },
  commentInput: {
    color: "#ffffff",
    flex: 1,
    fontSize: 13,
    minHeight: 38,
    paddingHorizontal: 8,
  },
  micButton: {
    alignItems: "center",
    backgroundColor: "#31505d",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  micButtonActive: {
    backgroundColor: "#dc3654",
  },
  sendButton: {
    backgroundColor: "#0f766e",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 11,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  recordingLabel: {
    color: "#fda4af",
    fontSize: 11,
    marginTop: 8,
  },
  shareOption: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  shareOptionCopy: {
    flex: 1,
    gap: 3,
  },
  shareOptionTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  shareOptionSubtitle: {
    color: "#aabac6",
    fontSize: 11,
  },
  liveTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  liveDot: {
    backgroundColor: "#f43f5e",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  livePreview: {
    alignItems: "center",
    backgroundColor: "#183746",
    borderRadius: 18,
    gap: 8,
    marginBottom: 17,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  livePreviewTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  livePreviewCaption: {
    color: "#b8c8d4",
    fontSize: 12,
    textAlign: "center",
  },
  seatsTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  seat: {
    alignItems: "center",
    backgroundColor: "rgba(167,243,208,0.07)",
    borderColor: "rgba(167,243,208,0.3)",
    borderRadius: 13,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 5,
    height: 75,
    justifyContent: "center",
    width: "31%",
  },
  seatLabel: {
    color: "#d2e4e7",
    fontSize: 10,
    fontWeight: "600",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    marginTop: 15,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  assistantTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  assistantIcon: {
    alignItems: "center",
    backgroundColor: "rgba(167,243,208,0.1)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  assistantBrand: {
    color: "#a7f3d0",
    fontSize: 11,
    marginTop: 2,
  },
  listeningPanel: {
    alignItems: "center",
    backgroundColor: "#183746",
    borderColor: "rgba(167,243,208,0.2)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 19,
    minHeight: 60,
    paddingHorizontal: 14,
  },
  listeningPanelActive: {
    backgroundColor: "#164e63",
    borderColor: "#34d399",
  },
  listeningText: {
    color: "#e2e8f0",
    flex: 1,
    fontSize: 13,
  },
  suggestionsTitle: {
    color: "#b8c8d4",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 19,
  },
  suggestionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  suggestionText: {
    color: "#e2e8f0",
    fontSize: 12,
  },
});
