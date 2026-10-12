# Cahier des charges — Écran 4 : Assistant vocal IA, commande et dictée vocale

## Version 1 sans secret

- Reconnaissance native `expo-speech-recognition` compatible Expo 57, React
  Native 0.86 et l'architecture Expo Modules; synthèse système via
  `expo-speech`. Langue fr-FR par défaut, en-US si la préférence d'application
  est anglaise.
- Une seule feuille d'écoute est montée à la racine. Le microphone discret de
  l'en-tête l'ouvre par défaut; le bouton flottant est désactivé par défaut et
  se règle dans Profil > Assistant vocal > Afficher le bouton flottant. Les
  boutons de dictée des champs restent disponibles. Chaque action déclenche
  une seule écoute; aucune écoute continue.
- Avant la première demande de permission, afficher une explication claire.
  Le moteur vocal et sa disponibilité sont vérifiés à la première activation,
  indépendamment de l'affichage du bouton flottant. Les erreurs de permission,
  de service et de langue restent visibles dans « Détails techniques ».
- Le parseur local `mobile/src/services/voiceAssistant.ts` utilise intentions,
  synonymes et correspondance approximative, sans IA ni clé secrète. Il ouvre
  les surfaces existantes : carte, Marché, canaux URGENCES et ANNONCES, profil
  et messages. La dictée n'envoie ni ne publie un texte automatiquement.
- Les appels aux numéros officiels configurés par pays ouvrent le composeur
  système et restent disponibles sans compte. Les actions protégées proposent
  la connexion aux invités.
- « Lancer un SOS » demande une seconde confirmation vocale « confirmer » ou
  une action sur le bouton, suivie d'un compte à rebours annulable. L'envoi
  conserve la confirmation finale de l'écran SOS.
- L'audio n'est pas stocké par QuartierPlus ni envoyé à son API. Aucun texte
  dicté ne doit être inclus dans Crashlytics ou les journaux. Un indicateur
  visible montre quand le microphone écoute.
- Une modification du module natif requiert un build APK Android; une mise à
  jour OTA ne peut pas ajouter la permission ou le code natif.

## Validation

- `npm test -- --runInBand` dans `mobile` couvre les commandes, les synonymes,
  les correspondances approximatives, l'appel officiel, les confirmations et
  la machine d'états de l'assistant.
- `npx tsc --noEmit` et `npx expo export --platform android` vérifient les
  types et le bundle Android.
- `npx expo prebuild --platform android --no-install` doit générer dans le
  manifeste `android.permission.RECORD_AUDIO`.
