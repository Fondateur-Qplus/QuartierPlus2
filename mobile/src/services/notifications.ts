import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import api from "./api";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isSos =
      notification.request.content.data?.type === "sos" ||
      notification.request.content.data?.priority === "high";
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: isSos
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.HIGH,
    };
  },
});

const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId;

export const registerPushNotifications = async (
  userId: string,
): Promise<string | null> => {
  if (Platform.OS === "web") return null;
  if (!userId) throw new Error("Un compte est requis pour enregistrer les notifications.");
  if (!projectId) {
    throw new Error(
      "L'identifiant de projet EAS est absent; configurez expo.extra.eas.projectId.",
    );
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("sos", {
      name: "Alertes SOS",
      description: "Alertes d'urgence prioritaires du quartier",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      sound: "default",
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Messages des canaux du quartier",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post("/v1/users/push-token", {
    token: pushToken.data,
    platform: Platform.OS,
  });
  return pushToken.data;
};

export const unregisterPushNotifications = async (token: string) => {
  await api.delete("/v1/users/push-token", { data: { token } });
};
