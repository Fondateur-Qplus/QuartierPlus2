import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Home,
  MapPin,
  MessageSquare,
  Radio,
  ShoppingBag,
  BriefcaseBusiness,
  CalendarDays,
  User,
  Users,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
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

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
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
          tabBarLabel: "Carte SOS",
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
        name="Talkie"
        component={WalkieTalkieScreen}
        options={{
          tabBarLabel: "Talkie",
          tabBarIcon: ({ color, size }) => <Radio color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Grin"
        component={GrinScreen}
        options={{
          tabBarLabel: "Grin",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
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
        name="EspacePro"
        component={ProTabNavigator}
        options={{
          tabBarLabel: "Pro",
          tabBarIcon: ({ color, size }) => (
            <BriefcaseBusiness color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Événements"
        component={EventsNavigator}
        options={{
          tabBarLabel: "Événements",
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, isSessionLoading } = useAuth();

  if (isSessionLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  const hasCompletedProfile =
    typeof user?.name === "string" &&
    user.name.trim().length > 0 &&
    typeof user?.neighborhood === "string" &&
    user.neighborhood.trim().length > 0;

  return (
    <Stack.Navigator
      key={!user ? "auth" : hasCompletedProfile ? "main" : "profile"}
      screenOptions={{ headerShown: false }}
    >
      {!user && (
        <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      )}
      {user && !hasCompletedProfile && (
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      )}
      {user && hasCompletedProfile && (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
      {user && hasCompletedProfile && (
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
      )}
    </Stack.Navigator>
  );
}

function VoiceAssistantLayer() {
  const { isSessionLoading, user } = useAuth();
  if (!user || isSessionLoading) return null;

  const navigate = (command: VoiceCommand) => {
    const hasCompletedProfile =
      typeof user.name === "string" &&
      user.name.trim().length > 0 &&
      typeof user.neighborhood === "string" &&
      user.neighborhood.trim().length > 0;
    if (!navigationRef.isReady() || !hasCompletedProfile) return false;
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

  return <VoiceAssistantModal onNavigate={navigate} />;
}

function AppNavigation() {
  const { clearActiveInput } = useVoiceAssistant();
  return (
    <NavigationContainer
      onStateChange={clearActiveInput}
      ref={navigationRef}
    >
      <RootNavigator />
      <VoiceAssistantLayer />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
  },
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
