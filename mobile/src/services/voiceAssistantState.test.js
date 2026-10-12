import { transitionVoiceAssistant } from "./voiceAssistantState";

describe("voice assistant state machine", () => {
  it("initializes only after activation, then enters and exits listening", () => {
    expect(transitionVoiceAssistant("idle", "activate")).toBe("initializing");
    expect(transitionVoiceAssistant("initializing", "ready")).toBe("ready");
    expect(transitionVoiceAssistant("ready", "start")).toBe("listening");
    expect(transitionVoiceAssistant("listening", "stop")).toBe("ready");
  });

  it.each([
    ["permission-denied", "permission-denied"],
    ["service-unavailable", "service-unavailable"],
    ["language-unsupported", "language-unsupported"],
  ])("exposes the %s failure state", (event, expected) => {
    expect(transitionVoiceAssistant("initializing", event)).toBe(expected);
  });

  it("can return to idle when dismissed and retry initialization", () => {
    expect(transitionVoiceAssistant("permission-denied", "reset")).toBe("idle");
    expect(transitionVoiceAssistant("service-unavailable", "activate")).toBe(
      "initializing",
    );
  });
});
