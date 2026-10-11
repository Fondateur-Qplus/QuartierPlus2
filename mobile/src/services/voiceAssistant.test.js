import {
  isVoiceCancellation,
  isVoiceConfirmation,
  parseVoiceCommand,
  VOICE_COMMAND_EXAMPLES,
} from "./voiceAssistant";

describe("parseVoiceCommand", () => {
  it("opens the map and tolerates a small recognition error", () => {
    expect(parseVoiceCommand("ouvre la carte sos")?.destination).toBe("CarteSOS");
    expect(parseVoiceCommand("ouvre le marhe")?.destination).toBe("Marche");
    expect(parseVoiceCommand("open map")?.destination).toBe("CarteSOS");
  });

  it.each([
    ["canal urgences", "emergency"],
    ["ouvrir le canal annonces", "announcements"],
  ])("selects the %s channel without treating it as a SOS", (phrase, channel) => {
    const command = parseVoiceCommand(phrase);
    expect(command?.destination).toBe("Messages");
    expect(command?.channelId).toBe(channel);
    expect(command?.requiresSosConfirmation).toBeUndefined();
  });

  it("opens the private message area for dictation without sending", () => {
    expect(parseVoiceCommand("dicter un message")).toMatchObject({
      destination: "Messages",
      dictateMessage: true,
      requiresAuthentication: true,
    });
  });

  it("opens the profile and messages destinations", () => {
    expect(parseVoiceCommand("ouvrir mon profil")?.destination).toBe("Profil");
    expect(parseVoiceCommand("ouvrir les messages")?.destination).toBe(
      "Messages",
    );
  });

  it("opens the marketplace listing form without publishing", () => {
    expect(parseVoiceCommand("créer une annonce")).toMatchObject({
      destination: "Marche",
      openCreateListing: true,
      requiresAuthentication: true,
    });
  });

  it("opens the announcements channel for a drafted announcement", () => {
    expect(parseVoiceCommand("publier dans le canal annonces")).toMatchObject({
      destination: "Messages",
      channelId: "announcements",
      createAnnouncement: true,
      requiresAuthentication: true,
    });
  });

  it.each([
    ["appeler les secours", "medical"],
    ["appeler la police", "police"],
    ["appeler les pompiers", "fire"],
    ["call emergency services", "medical"],
    ["call firefighters", "fire"],
  ])("opens the official phone dialer for %s", (phrase, service) => {
    const command = parseVoiceCommand(phrase);
    expect(command?.emergencyService).toBe(service);
    expect(command?.requiresAuthentication).not.toBe(true);
  });

  it("requires confirmation and authentication before opening SOS", () => {
    expect(parseVoiceCommand("lancer un SOS")).toMatchObject({
      destination: "CarteSOS",
      requiresSosConfirmation: true,
      requiresAuthentication: true,
    });
    expect(isVoiceConfirmation("confirmer")).toBe(true);
    expect(isVoiceConfirmation("confirm")).toBe(true);
    expect(isVoiceCancellation("annuler")).toBe(true);
  });

  it("returns no action for an unknown command", () => {
    expect(parseVoiceCommand("ouvre le cinéma")).toBeNull();
    expect(VOICE_COMMAND_EXAMPLES).toHaveLength(3);
    for (const example of VOICE_COMMAND_EXAMPLES) {
      expect(parseVoiceCommand(example)).not.toBeNull();
    }
  });
});
