# Secrets et configuration

Les valeurs réelles sont uniquement configurées dans GitHub Actions ou dans
l'environnement correspondant. Ne pas les ajouter au dépôt, aux journaux CI ou
aux bundles qui ne les nécessitent pas.

## Secrets de build de l'app

Configurer comme secrets GitHub :

- `GOOGLE_SERVICES_JSON` — configuration Firebase Android du projet
  `quartierplus-final` et du package `com.administrateur.quartierplus`.
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` — doit valoir l'identifiant
  `quartierplus-final`; le workflow le compare au fichier Google Services sans
  afficher la valeur du secret.
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `EXPO_PUBLIC_API_URL` — URL de l'API consommée par l'application.
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — clé SDK Android Maps; injectée dans le
  manifeste Android par `app.config.js`, jamais écrite dans un fichier suivi.
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — obligatoire pour le build Android.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — obligatoire pour l'authentification
  Google.
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — optionnel pour les builds iOS.
- `EXPO_PUBLIC_EAS_PROJECT_ID` — optionnel; l'identifiant défini dans `app.json`
  est utilisé en son absence.
- `EXPO_PUBLIC_LIVEKIT_URL` — optionnel; son absence désactive les fonctions
  LiveKit et déclenche un avertissement dans le workflow.

Les valeurs `EXPO_PUBLIC_*` sont intégrées au client et ne doivent donc jamais
contenir de secret serveur. Le workflow ne transmet au prebuild et à Gradle que
des variables dont le nom commence par `EXPO_PUBLIC_`.

## Secrets serveur uniquement

Ne jamais transmettre ces valeurs aux étapes Expo ou Gradle ni les intégrer à
l'application :

- `DATABASE_URL`
- `JWT_SECRET`
- `HMAC_SECRET`
- `API_KEY_SALT`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_URL`
- `LIVEKIT_API_SECRET`
- `FEDAPAY_SECRET_KEY`
- `FEDAPAY_WEBHOOK_SECRET`
- `TICKET_QR_SECRET`
- `SMS_DELIVERY_TOKEN`
- `EXPO_TOKEN` — authentification de l'automatisation EAS uniquement.

`CLOUDINARY_API_KEY`, `LIVEKIT_API_KEY`, `FEDAPAY_PUBLIC_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_IDS`, `LIVEKIT_URL`,
`FEDAPAY_ENVIRONMENT`, `SMS_DELIVERY_URL` et les variables de configuration
serveur restent côté serveur. Même les clés publiques serveur ne sont pas des
variables de build de l'application.
