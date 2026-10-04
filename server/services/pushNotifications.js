const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH_SIZE = 100;

export const sendExpoPushNotifications = async (tokens, notification) => {
  const uniqueTokens = [...new Set(tokens)].filter(
    (token) => typeof token === "string" && token.startsWith("ExpoPushToken["),
  );
  if (uniqueTokens.length === 0) return;

  for (let index = 0; index < uniqueTokens.length; index += MAX_BATCH_SIZE) {
    const batch = uniqueTokens.slice(index, index + MAX_BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: notification.title,
            body: notification.body,
            sound: "default",
            priority: notification.priority ?? "high",
            channelId: notification.channelId ?? "messages",
            data: notification.data ?? {},
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Expo Push API returned HTTP ${response.status}: ${errorBody.slice(0, 500)}`,
        );
      }
      const result = await response.json();
      const tickets = Array.isArray(result.data) ? result.data : [];
      tickets.forEach((ticket, ticketIndex) => {
        if (ticket?.status === "error") {
          console.error("Expo push ticket failed:", {
            token: batch[ticketIndex],
            message: ticket.message,
            details: ticket.details,
          });
        }
      });
    } catch (error) {
      console.error("Failed to deliver Expo push notification batch:", error);
    }
  }
};
