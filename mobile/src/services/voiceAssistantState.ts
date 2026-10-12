export type VoiceAssistantState =
  | "idle"
  | "initializing"
  | "ready"
  | "listening"
  | "permission-denied"
  | "service-unavailable"
  | "language-unsupported"
  | "error";

export type VoiceAssistantEvent =
  | "activate"
  | "ready"
  | "start"
  | "stop"
  | "permission-denied"
  | "service-unavailable"
  | "language-unsupported"
  | "error"
  | "reset";

export const transitionVoiceAssistant = (
  state: VoiceAssistantState,
  event: VoiceAssistantEvent,
): VoiceAssistantState => {
  switch (event) {
    case "activate":
      return "initializing";
    case "ready":
      return "ready";
    case "start":
      return "listening";
    case "stop":
      return state === "idle" ? "idle" : "ready";
    case "permission-denied":
    case "service-unavailable":
    case "language-unsupported":
    case "error":
      return event;
    case "reset":
      return "idle";
  }
};
