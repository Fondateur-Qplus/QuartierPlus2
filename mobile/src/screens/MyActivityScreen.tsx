import { useEffect, useState } from "react";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ArrowLeft, Plus } from "lucide-react-native";
import { API_BASE_URL, apiFetch } from "../services/api";
import type { RootStackParamList } from "../navigation/types";

type Activity = RootStackParamList["MyActivity"]["activity"];
type ActivityItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  imageUrl?: string;
};

const TITLES: Record<Activity, string> = {
  listings: "Mes Annonces & Produits",
  services: "Mes Services proposés",
  alerts: "Mes Alertes & Signalements émis",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getRows = (value: unknown, key: string): unknown[] => {
  if (Array.isArray(value)) return value;
  return isRecord(value) && Array.isArray(value[key]) ? value[key] : [];
};

export default function MyActivityScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "MyActivity">>();
  const activity = route.params.activity;
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      if (!API_BASE_URL) {
        setError("Le service est momentanément indisponible.");
        setLoading(false);
        return;
      }
      try {
        const url = activity === "alerts"
          ? `${API_BASE_URL}/v1/users/me/activities`
          : `${API_BASE_URL}/v1/users/me/marketplace-items?item_type=${activity === "services" ? "service" : "products"}`;
        const response = await apiFetch(url, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) throw new Error("Chargement refusé.");
        const payload: unknown = await response.json();
        const source = activity === "alerts"
          ? [...getRows(payload, "alerts"), ...getRows(payload, "reports")]
          : getRows(payload, "items");
        const normalized = source.flatMap((entry): ActivityItem[] => {
          if (!isRecord(entry) || typeof entry.id !== "string") return [];
          return [{
            id: entry.id,
            title: String(
              entry.title ??
                (entry.emergency_type
                  ? `Alerte ${String(entry.emergency_type).toLowerCase()}`
                  : entry.target_type
                    ? `Signalement ${String(entry.target_type).toLowerCase()}`
                    : "Activité"),
            ),
            description: String(entry.description ?? entry.reason ?? ""),
            status: String(entry.status ?? ""),
            createdAt: String(entry.created_at ?? ""),
            ...(typeof entry.image_url === "string"
              ? { imageUrl: entry.image_url }
              : {}),
          }];
        });
        if (active) {
          setItems(normalized);
          setError(null);
        }
      } catch {
        if (active) setError("Impossible de charger vos activités. Réessayez.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activity, retryKey]);

  const create = () => {
    if (activity === "alerts") {
      navigation.navigate("Main", { screen: "CarteSOS" });
      return;
    }
    navigation.navigate("Main", {
      screen: "Marche",
      params: {
        voiceRequestId: String(Date.now()),
        voiceCreateListing: true,
        voiceCreateType: activity === "services" ? "service" : "listing",
      },
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Retour" accessibilityRole="button" onPress={() => navigation.goBack()}>
          <ArrowLeft color="#334155" size={23} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{TITLES[activity]}</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#2563eb" size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryKey((value) => value + 1)} style={styles.button}>
            <Text style={styles.buttonText}>Réessayer</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={create} style={styles.button}>
            <Plus color="#ffffff" size={19} />
            <Text style={styles.buttonText}>{activity === "alerts" ? "Créer une alerte" : "Créer"}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Rien à afficher pour le moment</Text>
          <Text style={styles.emptyCopy}>
            Vos publications apparaîtront ici après leur création.
          </Text>
          <Pressable accessibilityRole="button" onPress={create} style={styles.button}>
            <Plus color="#ffffff" size={19} />
            <Text style={styles.buttonText}>{activity === "alerts" ? "Créer une alerte" : "Créer"}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} /> : null}
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.copy}>{item.description}</Text> : null}
              <Text style={styles.meta}>
                {[item.status, item.createdAt ? new Date(item.createdAt).toLocaleDateString("fr-FR") : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={create} style={styles.button}>
            <Plus color="#ffffff" size={19} />
            <Text style={styles.buttonText}>{activity === "alerts" ? "Créer une alerte" : "Créer"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f8fafc", flex: 1, padding: 18, paddingTop: 54 },
  header: { alignItems: "center", flexDirection: "row", gap: 14, marginBottom: 18 },
  title: { color: "#172b4d", flex: 1, fontSize: 20, fontWeight: "800" },
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  error: { color: "#b91c1c", textAlign: "center" },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { color: "#172b4d", fontSize: 18, fontWeight: "700" },
  emptyCopy: { color: "#64748b", lineHeight: 21, marginTop: 8, textAlign: "center" },
  list: { gap: 12, paddingBottom: 28 },
  card: { backgroundColor: "#fff", borderColor: "#e2e8f0", borderRadius: 12, borderWidth: 1, padding: 14 },
  image: { borderRadius: 8, height: 150, marginBottom: 10, width: "100%" },
  itemTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  copy: { color: "#475569", lineHeight: 20, marginTop: 6 },
  meta: { color: "#64748b", fontSize: 12, marginTop: 9 },
  button: { alignItems: "center", alignSelf: "stretch", backgroundColor: "#2563eb", borderRadius: 10, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 48 },
  buttonText: { color: "#fff", fontWeight: "700" },
});
