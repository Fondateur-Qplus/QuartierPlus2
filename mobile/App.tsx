import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Home,
  MapPin,
  Mic,
  MessageSquare,
  ShoppingBag,
  User,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import VoiceAssistantModal from "./src/components/VoiceAssistantModal";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import {
  VoiceAssistantProvider,
  useVoiceAssistant,
} from "./src/context/VoiceAssistantContext";
import type {
  MainTabParamList,
  RootStackParamList,
} from "./src/navigation/types";
import { OfflineQueryProvider } from "./src/services/queryClient";
import type { VoiceCommand } from "./src/services/voiceAssistant";
import CompleteProfileScreen from "./src/screens/auth/CompleteProfileScreen";
import PhoneAuthScreen from "./src/screens/auth/PhoneAuthScreen";
import GuestWelcomeScreen from "./src/screens/GuestWelcomeScreen";
import FeedScreen from "./src/screens/FeedScreen";
import GrinScreen from "./src/screens/GrinScreen";
import MapScreen from "./src/screens/MapScreen";
import MarketplaceScreen from "./src/screens/MarketplaceScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import CheckoutScreen from "./src/screens/main/CheckoutScreen";
import ProTabNavigator from "./src/navigation/ProTabNavigator";
import EventsNavigator from "./src/navigation/EventsNavigator";
import WalkieTalkieScreen from "./src/screens/WalkieTalkieScreen";
import { LockKeyhole, X } from "lucide-react-native";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          justifyContent: "space-around",
          height: 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 4),
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          includeFontPadding: false,
          maxWidth: "100%",
        },
        tabBarItemStyle: { flex: 1, minWidth: 0 },
      }}
    >
      <Tab.Screen
        name="Accueil"
        component={FeedScreen}
        options={{
          tabBarLabel: "Accueil",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="CarteSOS"
        component={MapScreen}
        options={{
          tabBarLabel: "Carte",
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Marche"
        component={MarketplaceScreen}
        options={{
          tabBarLabel: "Marché",
          tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarLabel: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MessageSquare color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profil"
        component={SettingsScreen}
        options={{
          tabBarLabel: "Profil",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Talkie"
        component={WalkieTalkieScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="Grin"
        component={GrinScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="EspacePro"
        component={ProTabNavigator}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="Événements"
        component={EventsNavigator}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, isSessionLoading } = useAuth();
  const [introductionSeen, setIntroductionSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync("quartierplus.introduction-seen")
      .then((value) => {
        if (active) setIntroductionSeen(value === "true");
      })
      .catch(() => {
        if (active) setIntroductionSeen(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (isSessionLoading || introductionSeen === null) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  const hasCompletedProfile =
    typeof user?.name === "string" && user.name.trim().length > 0;

  return (
    <Stack.Navigator
      initialRouteName={introductionSeen ? "Main" : "Welcome"}
      screenOptions={{ headerShown: false }}
    >
      {!introductionSeen && (
        <Stack.Screen name="Welcome" component={GuestWelcomeScreen} />
      )}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      {user && !hasCompletedProfile && (
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      )}
      {user && hasCompletedProfile && (
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
      )}
    </Stack.Navigator>
  );
}

function VoiceAssistantLayer({ currentRoute }: { currentRoute: string }) {
  const { isSessionLoading, requestAuthentication, user } = useAuth();
  const { isAssistantActive, requestAssistant } = useVoiceAssistant();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (isSessionLoading) return null;

  const navigate = (command: VoiceCommand) => {
    const hasCompletedProfile =
      typeof user?.name === "string" && user.name.trim().length > 0;
    if (command.requiresAuthentication && !user) {
      requestAuthentication();
      return true;
    }
    if (!navigationRef.isReady()) return false;
    if (command.requiresAuthentication && user && !hasCompletedProfile) {
      navigationRef.navigate("CompleteProfile");
      return true;
    }
    if (!command.destination) return false;
    switch (command.destination) {
      case "CarteSOS":
        navigationRef.navigate("Main", {
          screen: "CarteSOS",
          params: { voiceSosRequestId: command.requestId },
        });
        break;
      case "Marche":
        navigationRef.navigate("Main", {
          screen: "Marche",
          params: {
            voiceRequestId: command.requestId,
            voiceSearch: command.searchText,
            voiceCreateListing: command.openCreateListing,
          },
        });
        break;
      case "Messages":
        navigationRef.navigate("Main", {
          screen: "Messages",
          params: {
            voiceRequestId: command.requestId,
            voiceContactQuery: command.contactQuery,
            voiceChannelId: command.channelId,
          },
        });
        break;
      case "Accueil":
      case "Talkie":
      case "Grin":
      case "Profil":
        navigationRef.navigate("Main", { screen: command.destination });
        break;
    }
    return true;
  };

  const hideAssistant =
    isAssistantActive ||
    keyboardVisible ||
    ["PhoneAuth", "CompleteProfile", "Welcome"].includes(currentRoute ?? "");
  const assistantBottom =
    currentRoute === "Messages"
      ? 136
      : currentRoute === "CarteSOS"
        ? 104
        : 66;
  return (
    <>
      {!hideAssistant && (
        <Pressable
          accessibilityLabel="Assistant vocal"
          accessibilityRole="button"
          onPress={requestAssistant}
          style={[styles.voiceButton, { bottom: insets.bottom + assistantBottom }]}
        >
          <Mic color="#ffffff" size={23} />
        </Pressable>
      )}
      <VoiceAssistantModal onNavigate={navigate} />
    </>
  );
}

function AppNavigation() {
  const { clearActiveInput } = useVoiceAssistant();
  const [currentRoute, setCurrentRoute] = useState("Welcome");
  return (
    <NavigationContainer
      onStateChange={() => {
        clearActiveInput();
        setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? "");
      }}
      onReady={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? "")}
      ref={navigationRef}
    >
      <RootNavigator />
      <VoiceAssistantLayer currentRoute={currentRoute} />
      <AuthPromptLayer />
    </NavigationContainer>
  );
}

function AuthPromptLayer() {
  const { authPromptVisible, dismissAuthPrompt } = useAuth();
  const openAuth = (mode: "login" | "register") => {
    dismissAuthPrompt();
    navigationRef.navigate("PhoneAuth", { mode });
  };
  return (
    <Modal
      animationType="slide"
      onRequestClose={dismissAuthPrompt}
      transparent
      visible={authPromptVisible}
    >
      <View style={styles.promptBackdrop}>
        <View style={styles.promptSheet}>
          <Pressable
            accessibilityLabel="Fermer"
            accessibilityRole="button"
            onPress={dismissAuthPrompt}
            style={styles.promptClose}
          >
            <X color="#53605a" size={20} />
          </Pressable>
          <View style={styles.promptIcon}><LockKeyhole color="#b9382f" size={23} /></View>
          <Text accessibilityRole="header" style={styles.promptTitle}>Connectez-vous pour continuer</Text>
          <Text style={styles.promptCopy}>Créez un compte ou connectez-vous pour accéder à cette action.</Text>
          <Pressable accessibilityRole="button" onPress={() => openAuth("login")} style={styles.promptPrimary}>
            <Text style={styles.promptPrimaryText}>Se connecter</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openAuth("register")} style={styles.promptSecondary}>
            <Text style={styles.promptSecondaryText}>Créer un compte</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voiceButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 28,
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
  loading: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
  },
  promptBackdrop: {
    backgroundColor: "rgba(20, 25, 21, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  promptSheet: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  promptClose: { alignItems: "center", height: 40, justifyContent: "center", position: "absolute", right: 16, top: 12, width: 40 },
  promptIcon: { alignItems: "center", backgroundColor: "#fff0eb", borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  promptTitle: { color: "#252823", fontSize: 20, fontWeight: "800", marginTop: 16, textAlign: "center" },
  promptCopy: { color: "#65675e", fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 8, textAlign: "center" },
  promptPrimary: { alignItems: "center", backgroundColor: "#252823", borderRadius: 8, justifyContent: "center", minHeight: 50, width: "100%" },
  promptPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  promptSecondary: { alignItems: "center", justifyContent: "center", minHeight: 48, width: "100%" },
  promptSecondaryText: { color: "#252823", fontSize: 14, fontWeight: "700" },
});

export default function App() {
  return (
    <OfflineQueryProvider>
      <AuthProvider>
        <VoiceAssistantProvider>
          <AppNavigation />
        </VoiceAssistantProvider>
      </AuthProvider>
    </OfflineQueryProvider>
  );
}
