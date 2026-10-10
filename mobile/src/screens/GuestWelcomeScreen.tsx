import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft, ArrowRight, MapPin, Megaphone, Shield } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../navigation/types";

const slides = [
  {
    eyebrow: "RÉAGIR ENSEMBLE",
    title: "Un SOS, un geste",
    description: "Prévenez rapidement les personnes de confiance autour de vous.",
    Icon: Shield,
    color: "#b9382f",
    background: "#fff0eb",
  },
  {
    eyebrow: "VOISINS RELAIS",
    title: "La solidarité à portée de main",
    description: "Des voisins volontaires relaient les alertes et les besoins urgents.",
    Icon: MapPin,
    color: "#28765c",
    background: "#e9f4ed",
  },
  {
    eyebrow: "COMMERCE LOCAL",
    title: "Faites vivre le quartier",
    description: "Découvrez les annonces, les services et les commerces près de chez vous.",
    Icon: Megaphone,
    color: "#a36a20",
    background: "#fbf1dc",
  },
];

export default function GuestWelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const Icon = slide.Icon;

  const continueTo = async (destination: "Main" | "PhoneAuth") => {
    await SecureStore.setItemAsync("quartierplus.introduction-seen", "true").catch(
      () => undefined,
    );
    if (destination === "Main") navigation.replace("Main", { screen: "Accueil" });
    else navigation.replace("PhoneAuth");
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>Q+</Text></View>
        <Text style={styles.brandName}>QuartierPlus</Text>
      </View>
      <View style={styles.content}>
        <View style={[styles.illustration, { backgroundColor: slide.background }]}>
          <Icon color={slide.color} size={58} strokeWidth={1.7} />
          <View style={[styles.orbit, { borderColor: slide.color }]} />
        </View>
        <Text style={[styles.eyebrow, { color: slide.color }]}>{slide.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
        <View style={styles.pagination}>
          {slides.map((item, itemIndex) => (
            <View key={item.eyebrow} style={[styles.dot, itemIndex === index && styles.activeDot]} />
          ))}
        </View>
      </View>
      {index < slides.length - 1 ? (
        <View style={styles.navigationRow}>
          <Pressable
            accessibilityLabel="Écran précédent"
            accessibilityRole="button"
            disabled={index === 0}
            onPress={() => setIndex((current) => current - 1)}
            style={styles.iconButton}
          >
            <ArrowLeft color={index === 0 ? "#b9b8b2" : "#252823"} size={20} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setIndex((current) => current + 1)} style={styles.nextButton}>
            <Text style={styles.nextText}>Continuer</Text>
            <ArrowRight color="#fff" size={18} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => void continueTo("Main")} style={styles.exploreButton}>
            <Text style={styles.exploreText}>Explorer l’app</Text>
          </Pressable>
          <View style={styles.authActions}>
            <Pressable accessibilityRole="button" onPress={() => void continueTo("PhoneAuth")} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Se connecter</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void continueTo("PhoneAuth")} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Créer un compte</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f8f7f1", flex: 1, justifyContent: "space-between", padding: 24, paddingTop: 58 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: { alignItems: "center", backgroundColor: "#252823", borderRadius: 10, height: 38, justifyContent: "center", width: 38 },
  brandMarkText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  brandName: { color: "#252823", fontSize: 16, fontWeight: "700" },
  content: { alignItems: "center", marginTop: -16, paddingHorizontal: 8 },
  illustration: { alignItems: "center", borderRadius: 72, height: 144, justifyContent: "center", marginBottom: 36, position: "relative", width: 144 },
  orbit: { borderRadius: 58, borderStyle: "dashed", borderWidth: 1, height: 116, position: "absolute", transform: [{ rotate: "-18deg" }], width: 116 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, marginBottom: 12 },
  title: { color: "#252823", fontSize: 30, fontWeight: "800", lineHeight: 36, maxWidth: 320, textAlign: "center" },
  description: { color: "#65675e", fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 320, textAlign: "center" },
  pagination: { flexDirection: "row", gap: 7, marginTop: 28 },
  dot: { backgroundColor: "#d4d2c8", borderRadius: 4, height: 7, width: 7 },
  activeDot: { backgroundColor: "#252823", width: 22 },
  navigationRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 16 },
  iconButton: { alignItems: "center", borderColor: "#d8d7cf", borderRadius: 24, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  nextButton: { alignItems: "center", backgroundColor: "#252823", borderRadius: 8, flexDirection: "row", gap: 12, justifyContent: "center", minHeight: 50, paddingHorizontal: 24 },
  nextText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  actions: { gap: 10, paddingBottom: 16 },
  exploreButton: { alignItems: "center", backgroundColor: "#252823", borderRadius: 8, justifyContent: "center", minHeight: 54 },
  exploreText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  authActions: { flexDirection: "row", gap: 10 },
  secondaryButton: { alignItems: "center", borderColor: "#d8d7cf", borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48 },
  secondaryText: { color: "#252823", fontSize: 14, fontWeight: "600" },
});