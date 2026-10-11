import type { MainTabParamList } from "../navigation/types";

export type VoiceDestination = keyof MainTabParamList;
export type EmergencyServiceId = "police" | "fire" | "medical";
export type VoiceChannelId = "emergency" | "announcements";

export type VoiceCommand = {
  destination?: VoiceDestination;
  feedback: string;
  requestId: string;
  emergencyService?: EmergencyServiceId;
  channelId?: VoiceChannelId;
  searchText?: string;
  contactQuery?: string;
  openCreateListing?: boolean;
  createAnnouncement?: boolean;
  dictateMessage?: boolean;
  requiresAuthentication?: boolean;
  requiresSosConfirmation?: boolean;
};

type CommandIntent =
  | "map"
  | "market"
  | "messages"
  | "profile"
  | "home"
  | "emergency-channel"
  | "announcement-channel";

const SIMPLE_COMMANDS: {
  intent: CommandIntent;
  aliases: string[];
}[] = [
  {
    intent: "emergency-channel",
    aliases: [
      "canal urgences",
      "canal urgence",
      "urgences",
      "ouvrir les urgences",
      "ouvrir le canal urgences",
      "canal emergency",
      "emergency channel",
      "channel emergency",
      "open emergency channel",
    ],
  },
  {
    intent: "announcement-channel",
    aliases: [
      "canal annonces",
      "canal annonce",
      "ouvrir les annonces",
      "ouvrir le canal annonces",
      "informations du quartier",
      "announcements channel",
      "announcement channel",
      "channel announcements",
      "open announcements",
    ],
  },
  {
    intent: "map",
    aliases: [
      "carte",
      "carte sos",
      "ouvrir la carte",
      "ouvre la carte",
      "map",
      "open map",
    ],
  },
  {
    intent: "market",
    aliases: [
      "marche",
      "marketplace",
      "boutique",
      "ouvrir le marche",
      "ouvre le marche",
      "open marketplace",
    ],
  },
  {
    intent: "messages",
    aliases: [
      "messages",
      "message",
      "conversations",
      "discuter",
      "ouvrir les messages",
      "open messages",
    ],
  },
  {
    intent: "profile",
    aliases: [
      "profil",
      "mon profil",
      "ouvrir le profil",
      "mes contacts",
      "profile",
      "open profile",
    ],
  },
  {
    intent: "home",
    aliases: [
      "accueil",
      "fil",
      "actualites",
      "ouvrir l accueil",
      "home",
      "open home",
    ],
  },
];

export const VOICE_COMMAND_EXAMPLES = [
  "Ouvrir la carte",
  "Canal Urgences",
  "Appeler les secours",
] as const;

export const VOICE_CONTEXTUAL_STRINGS = [
  "QuartierPlus",
  "Marché",
  "annonce",
  "messages",
  "contact",
  "SOS",
  "Talkie-Walkie",
  "Grin",
  "profil",
  "urgences",
  "pompiers",
  "ambulance",
  "emergency",
  "marketplace",
  "announcement",
  "police",
  "firefighters",
];

const normalizeSpeech = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const isCloseWord = (word: string, candidate: string) => {
  if (word === candidate) return true;
  if (Math.min(word.length, candidate.length) < 4) return false;
  const maxDistance = Math.min(word.length, candidate.length) >= 7 ? 2 : 1;
  return editDistance(word, candidate) <= maxDistance;
};

const matchesTerm = (phrase: string, term: string) => {
  if (phrase.includes(term)) return true;
  const words = phrase.split(" ");
  const terms = term.split(" ");
  if (terms.length === 1) {
    return words.some((word) => isCloseWord(word, term));
  }
  return words.some((_, index) => {
    const candidate = words.slice(index, index + terms.length);
    return (
      candidate.length === terms.length &&
      candidate.every((word, termIndex) => isCloseWord(word, terms[termIndex]))
    );
  });
};

const hasAnyTerm = (phrase: string, terms: string[]) =>
  terms.some((term) => matchesTerm(phrase, term));

const matchesAlias = (phrase: string, alias: string) => {
  if (phrase === alias || phrase.includes(alias)) return true;
  return matchesTerm(phrase, alias);
};

const makeCommand = (
  destination: VoiceDestination,
  feedback: string,
  options: Omit<VoiceCommand, "destination" | "feedback" | "requestId"> = {},
): VoiceCommand => ({
  destination,
  feedback,
  requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  ...options,
});

const removeLeadingArticle = (text: string) =>
  text.replace(/^(?:un|une|des|le|la|les)\s+/, "");

export function isVoiceConfirmation(transcript: string) {
  return /^(?:(?:oui|yes)\s+)?(?:confirmer?|confirm)$/.test(
    normalizeSpeech(transcript),
  );
}

export function isVoiceCancellation(transcript: string) {
  return /^(?:(?:non|no)\s+)?(?:annuler|annule|cancel|stop)$/.test(
    normalizeSpeech(transcript),
  );
}

export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const phrase = normalizeSpeech(transcript);
  if (!phrase) return null;

  if (
    hasAnyTerm(phrase, [
      "sos",
      "au secours",
      "alerte d urgence",
      "emergency alert",
    ]) &&
    hasAnyTerm(phrase, ["pas", "annule", "annuler", "arrete", "stop", "cancel"])
  ) {
    return null;
  }

  if (
    hasAnyTerm(phrase, [
      "lancer",
      "envoyer",
      "declencher",
      "demander",
      "launch",
      "send",
      "trigger",
    ]) &&
    hasAnyTerm(phrase, [
      "sos",
      "alerte",
      "au secours",
      "urgence",
      "emergency alert",
    ]) &&
    !hasAnyTerm(phrase, [
      "appeler",
      "appelle",
      "telephoner",
      "composer",
      "call",
      "dial",
    ])
  ) {
    return makeCommand(
      "CarteSOS",
      "Lancer une demande SOS ? L’alerte ne sera envoyée qu’après confirmation et compte à rebours.",
      { requiresSosConfirmation: true, requiresAuthentication: true },
    );
  }

  if (
    phrase === "au secours" &&
    !hasAnyTerm(phrase, ["appeler", "appelle", "telephoner", "composer", "call"])
  ) {
    return makeCommand(
      "CarteSOS",
      "Lancer une demande SOS ? L’alerte ne sera envoyée qu’après confirmation et compte à rebours.",
      { requiresSosConfirmation: true, requiresAuthentication: true },
    );
  }

  const isEmergencyCall = hasAnyTerm(phrase, [
    "appeler",
    "appelle",
    "telephoner",
    "composer",
    "joindre",
    "appeler les secours",
    "call",
    "dial",
    "phone",
  ]);
  const emergencyService = hasAnyTerm(phrase, ["police", "gendarmerie"])
    ? "police"
    : hasAnyTerm(phrase, [
          "pompiers",
          "incendie",
          "feu",
          "fire",
          "firefighters",
        ])
      ? "fire"
      : "medical";
  if (
    isEmergencyCall &&
    hasAnyTerm(phrase, [
      "secours",
      "urgence",
      "police",
      "gendarmerie",
      "pompiers",
      "incendie",
      "ambulance",
      "samu",
      "medical",
      "emergency services",
      "fire",
      "firefighters",
    ])
  ) {
    return {
      feedback: "J’ouvre le téléphone pour appeler les secours.",
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      emergencyService,
    };
  }

  if (
    hasAnyTerm(phrase, [
      "publier",
      "creer",
      "rediger",
      "poster",
      "publish",
      "post",
      "create",
    ]) &&
    hasAnyTerm(phrase, [
      "dans le canal annonces",
      "sur le canal annonces",
      "in the announcements channel",
    ])
  ) {
    return makeCommand(
      "Messages",
      "J’ouvre le canal Annonces. Vérifiez votre message avant de l’envoyer.",
      {
        channelId: "announcements",
        createAnnouncement: true,
        requiresAuthentication: true,
      },
    );
  }

  if (
    hasAnyTerm(phrase, ["creer", "rediger", "create", "write"]) &&
    hasAnyTerm(phrase, ["announcement", "announcements"])
  ) {
    return makeCommand(
      "Messages",
      "J’ouvre le canal Annonces. Vérifiez votre message avant de l’envoyer.",
      {
        channelId: "announcements",
        createAnnouncement: true,
        requiresAuthentication: true,
      },
    );
  }

  if (
    hasAnyTerm(phrase, [
      "publier",
      "creer",
      "ajouter",
      "vendre",
      "publish",
      "create",
      "sell",
    ]) &&
    hasAnyTerm(phrase, [
      "annonce",
      "produit",
      "service",
      "listing",
      "ad",
    ])
  ) {
    return makeCommand(
      "Marche",
      "J’ouvre le formulaire de publication. Vérifiez les détails avant de publier.",
      { openCreateListing: true, requiresAuthentication: true },
    );
  }

  const contactQuery = phrase.match(
    /(?:rechercher|chercher|trouver|trouve)\s+(?:un|une|des)?\s*(?:contact|contacts|conversation|conversations|message|messages)\s*(?:de|avec|pour)?\s*(.*)/,
  )?.[1]?.trim();
  const requestedContact =
    contactQuery ??
    phrase.match(
      /(?:envoyer|ecrire|rediger)\s+(?:un\s+)?message\s+(?:a|avec|pour)\s+(.+)/,
    )?.[1]?.trim();
  if (contactQuery !== undefined || requestedContact !== undefined) {
    return makeCommand(
      "Messages",
      requestedContact
        ? `Je recherche ${requestedContact} dans vos conversations.`
        : "J’ouvre vos conversations privées.",
      {
        contactQuery: requestedContact,
        requiresAuthentication: true,
      },
    );
  }

  if (
    hasAnyTerm(phrase, [
      "dicter un message",
      "ecrire un message vocal",
      "dictate a message",
      "write a message",
    ])
  ) {
    return makeCommand(
      "Messages",
      "Choisissez une conversation, puis utilisez le microphone dans le champ du message.",
      { dictateMessage: true, requiresAuthentication: true },
    );
  }

  const listingQuery = phrase.match(
    /(?:rechercher|chercher|trouver|trouve)\s+(?:une?\s+)?(?:annonce|annonces|article|articles)\s*(?:pour|sur|de|:)?\s*(.*)/,
  )?.[1]?.trim();
  if (listingQuery !== undefined) {
    return makeCommand(
      "Marche",
      listingQuery
        ? `Je recherche ${listingQuery} dans les annonces.`
        : "J’ouvre la recherche des annonces.",
      { searchText: removeLeadingArticle(listingQuery) },
    );
  }

  if (hasAnyTerm(phrase, ["talkie", "talkie walkie", "walkie talkie", "radio"])) {
    return makeCommand(
      "Talkie",
      "J’ouvre le Talkie-Walkie. La transmission reste à activer dans l’écran.",
    );
  }

  if (hasAnyTerm(phrase, ["grin", "video", "rencontre video"])) {
    return makeCommand("Grin", "J’ouvre le Grin.");
  }

  const intent = SIMPLE_COMMANDS.find(({ aliases }) =>
    aliases.some((alias) => matchesAlias(phrase, alias)),
  )?.intent;
  switch (intent) {
    case "emergency-channel":
      return makeCommand("Messages", "J’ouvre le canal Urgences.", {
        channelId: "emergency",
      });
    case "announcement-channel":
      return makeCommand("Messages", "J’ouvre le canal Annonces.", {
        channelId: "announcements",
      });
    case "profile":
      return makeCommand("Profil", "J’ouvre votre profil et vos contacts.");
    case "messages":
      return makeCommand(
        "Messages",
        "J’ouvre vos messages. Choisissez une conversation avant l’envoi.",
      );
    case "market":
      return makeCommand("Marche", "J’ouvre le Marché.");
    case "map":
      return makeCommand("CarteSOS", "J’ouvre la carte SOS.");
    case "home":
      return makeCommand("Accueil", "J’ouvre l’accueil.");
    default:
      return null;
  }
}

export function speechErrorMessage(error: string, isOffline: boolean): string {
  if (error === "not-allowed") {
    return "L’accès au microphone ou à la reconnaissance vocale a été refusé. Autorisez-le dans les réglages de l’appareil.";
  }
  if (error === "network" && isOffline) {
    return "La reconnaissance hors ligne n’est pas disponible pour le français sur cet appareil. Reconnectez-vous ou utilisez le clavier.";
  }
  if (error === "network") {
    return "La reconnaissance vocale a perdu sa connexion réseau. Réessayez ou utilisez le clavier.";
  }
  if (error === "service-not-allowed" || error === "language-not-supported") {
    return "La reconnaissance vocale française n’est pas disponible sur cet appareil.";
  }
  if (error === "no-speech" || error === "speech-timeout") {
    return "Aucune parole n’a été détectée. Réessayez.";
  }
  return "La reconnaissance vocale a échoué. Réessayez ou utilisez le clavier.";
}
