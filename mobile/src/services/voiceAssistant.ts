import type { MainTabParamList } from "../navigation/types";

export type VoiceDestination = keyof MainTabParamList;

export type VoiceCommand = {
  destination: VoiceDestination;
  feedback: string;
  requestId: string;
  searchText?: string;
  contactQuery?: string;
  openCreateListing?: boolean;
  requiresSosConfirmation?: boolean;
};

const normalizeSpeech = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const removeLeadingArticle = (text: string) =>
  text.replace(/^(?:un|une|des|le|la|les)\s+/, "");

const createRequestId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const phrase = normalizeSpeech(transcript);
  if (!phrase) return null;
  const requestId = createRequestId();

  if (
    /\b(sos|urgence|au secours|alerte d urgence)\b/.test(phrase) &&
    /\b(pas|annule|annuler|arrete|stop)\b/.test(phrase)
  ) {
    return null;
  }

  if (/\b(sos|urgence|au secours|alerte d urgence)\b/.test(phrase)) {
    return {
      destination: "CarteSOS",
      feedback:
        "Ouvrir le panneau SOS ? L’alerte ne sera envoyée qu’après confirmation dans l’écran SOS.",
      requestId,
      requiresSosConfirmation: true,
    };
  }

  if (
    /\b(publier|creer|ajouter)\b/.test(phrase) &&
    /\b(annonce|produit|service)\b/.test(phrase)
  ) {
    return {
      destination: "Marche",
      feedback: "J’ouvre le formulaire de publication. Vérifiez les détails avant de publier.",
      requestId,
      openCreateListing: true,
    };
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
    return {
      destination: "Messages",
      feedback: requestedContact
        ? `Je recherche ${requestedContact} dans vos conversations.`
        : "J’ouvre vos conversations privées.",
      requestId,
      contactQuery: requestedContact,
    };
  }

  const listingQuery = phrase.match(
    /(?:rechercher|chercher|trouver|trouve)\s+(?:une?\s+)?(?:annonce|annonces|article|articles)\s*(?:pour|sur|de|:)?\s*(.*)/,
  )?.[1]?.trim();
  if (listingQuery !== undefined) {
    return {
      destination: "Marche",
      feedback: listingQuery
        ? `Je recherche ${listingQuery} dans les annonces.`
        : "J’ouvre la recherche des annonces.",
      requestId,
      searchText: removeLeadingArticle(listingQuery),
    };
  }

  if (/\b(talkie|talkie walkie|walkie talkie|radio)\b/.test(phrase)) {
    return {
      destination: "Talkie",
      feedback: "J’ouvre le Talkie-Walkie. La transmission reste à activer dans l’écran.",
      requestId,
    };
  }

  if (/\b(grin|video|rencontre video)\b/.test(phrase)) {
    return {
      destination: "Grin",
      feedback: "J’ouvre le Grin.",
      requestId,
    };
  }

  if (/\b(profil|mes contacts|contact sos)\b/.test(phrase)) {
    return {
      destination: "Profil",
      feedback: "J’ouvre votre profil et vos contacts.",
      requestId,
    };
  }

  if (/\b(message|messages|conversation|conversations|discuter)\b/.test(phrase)) {
    return {
      destination: "Messages",
      feedback: "J’ouvre vos messages. Choisissez une conversation avant l’envoi.",
      requestId,
    };
  }

  if (/\b(marche|marketplace|annonce|annonces|boutique)\b/.test(phrase)) {
    return {
      destination: "Marche",
      feedback: "J’ouvre le Marché.",
      requestId,
    };
  }

  if (/\b(carte|carte sos|map)\b/.test(phrase)) {
    return {
      destination: "CarteSOS",
      feedback: "J’ouvre la carte SOS.",
      requestId,
    };
  }

  if (/\b(accueil|fil|actualites|actualite)\b/.test(phrase)) {
    return {
      destination: "Accueil",
      feedback: "J’ouvre l’accueil.",
      requestId,
    };
  }

  return null;
}

export function speechErrorMessage(
  error: string,
  isOffline: boolean,
): string {
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
];
