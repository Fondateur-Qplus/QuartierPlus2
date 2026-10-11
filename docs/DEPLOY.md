# Déployer l'API QuartierPlus sur Render

## Ce qu'il faut savoir

- Serveur : Node.js 20, Express 5.1.0, écoute sur `PORT` (3000 par défaut en
  local). La commande de démarrage est `npm start`, soit `node index.js`.
  `server/package.json` ne verrouille pas le numéro de Node ; les workflows du
  dépôt utilisent Node 20.
- Base requise : PostgreSQL avec les extensions `uuid-ossp` et **PostGIS**. Le
  schéma utilise des colonnes spatiales ; PostgreSQL seul ne suffit pas.
- L'API expose déjà `GET /health`. Cette route exécute `SELECT 1` : une réponse
  `200` confirme que le serveur peut joindre PostgreSQL. Aucun changement de
  route n'est nécessaire.
- L'historique Git, les configurations, les README et les workflows examinés
  ne montrent pas d'hébergeur backend déjà utilisé. Les workflows existants
  concernent les builds mobiles et EAS.

## 1. Créer la base PostgreSQL

Depuis le téléphone, créez une base dans Neon ou Supabase et copiez son URL de
connexion PostgreSQL complète. Gardez-la privée : elle contient les
informations d'accès à la base.

Dans l'éditeur SQL de cette base, assurez-vous que les extensions suivantes
sont activées :

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
```

Puis exécutez, dans cet ordre, le contenu des fichiers du dépôt :

1. `server/db/schema.sql`
2. `server/db/seeds.sql`
3. `migrations/005_monetization_fedapay.sql`
4. `migrations/006_pro_selected_features.sql`
5. `migrations/007_events_ticketing.sql`

Les migrations 006 et 007 dépendent des tables introduites par la migration
005. Ces instructions concernent une **base neuve**. N'appliquez pas le schéma
initial sur une base déjà utilisée ; les migrations pour anciens schémas
doivent être choisies en fonction de leur version.

## 2. Créer le service web Render

1. Ouvrez Render et connectez-vous avec GitHub.
2. Touchez **New +**, puis **Web Service**.
3. Sélectionnez le dépôt `Fondateur-Administrateur/QuartierPlus1` et la branche
   `main`.
4. Donnez un nom au service. Choisissez **Node** comme environnement.
5. Dans les réglages de construction, entrez :
   - **Root Directory** : `server`
   - **Build Command** : `npm ci`
   - **Start Command** : `npm start`
6. Indiquez le chemin du contrôle de santé : `/health`.
7. Ajoutez les variables de la section suivante, puis touchez **Create Web
   Service**. Render construit et démarre l'API.

Render fournit au service une valeur `PORT` et configure automatiquement le
certificat HTTPS pour son domaine `onrender.com`. Après le premier déploiement,
copiez l'adresse HTTPS affichée sur la page du service (par exemple
`https://<nom-du-service>.onrender.com`). C'est l'URL publique de l'API ; ne
rajoutez pas `/health` ni `/api/v1` à sa valeur de base.

## 3. Variables à configurer sur Render

Dans **Environment** du service Render, créez les variables suivantes. Saisissez
leurs vraies valeurs dans Render ; ne les inscrivez pas dans le dépôt.

### Réglages de déploiement

| Nom | Configuration |
| --- | --- |
| `NODE_VERSION` | `20`, pour utiliser la version Node des workflows du dépôt |
| `NODE_ENV` | `production` |
| `PGSSL` | `true` pour activer TLS vers PostgreSQL |

### Requis par l'API au démarrage en production

| Nom | Configuration |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL copiée depuis Neon ou Supabase |
| `JWT_SECRET` | Secret aléatoire d'au moins 32 caractères |
| `TICKET_QR_SECRET` | Autre secret aléatoire stable d'au moins 32 caractères |
| `GOOGLE_CLIENT_ID` | Identifiant OAuth client Web Google utilisé par l'application |
| `LIVEKIT_API_KEY` | Clé API du projet LiveKit |
| `LIVEKIT_API_SECRET` | Secret API correspondant de LiveKit |
| `LIVEKIT_URL` | URL WebSocket LiveKit en `wss://` |
| `SMS_DELIVERY_URL` | URL HTTPS du relais SMS de production |
| `SMS_DELIVERY_TOKEN` | Jeton du relais SMS |

L'application refuse de démarrer en production si un des éléments de la liste
des variables requises ci-dessus manque. `NODE_ENV` doit être défini sur
`production` pour activer ces vérifications, et `PGSSL=true` active le TLS vers
la base. `TICKET_QR_SECRET` doit rester stable après le déploiement : le changer
invaliderait les signatures des billets déjà émis.

### À ajouter seulement pour les fonctions utilisées

| Nom | Utilité |
| --- | --- |
| `GOOGLE_CLIENT_IDS` | Autres identifiants OAuth autorisés, séparés par des virgules |
| `JWT_EXPIRES_IN` | Durée de validité des jetons ; valeur par défaut : `7d` |
| `OTP_TEST_ALLOWLIST` | Numéros E.164 séparés par des virgules, uniquement pour le code OTP de test hors production |
| `IS_PROMO_FREE_ACCESS` | `true` ou `false` pour le mode découverte |
| `FEDAPAY_SECRET_KEY` | Clé secrète FedaPay pour les paiements |
| `FEDAPAY_PUBLIC_KEY` | Clé publique FedaPay |
| `FEDAPAY_ENVIRONMENT` | `sandbox` pour les tests, `live` pour la production |
| `FEDAPAY_WEBHOOK_SECRET` | Secret configuré dans l'en-tête du webhook FedaPay |
| `SOCKET_CORS_ORIGIN` | Origines web autorisées, séparées par des virgules |

`PORT` est fourni par Render : ne le créez pas manuellement. `OTP_TEST_MODE`
doit être absent ou `false` en production ; le serveur refuse `true`, même si
`OTP_TEST_ALLOWLIST` est renseignée. Hors production, seul un numéro présent
dans cette liste reçoit le code fixe `123456`; les autres numéros exigent la
configuration SMS et reçoivent un code aléatoire.

Le HMAC des codes stockés dans `code_hash` utilise `JWT_SECRET` dans
`authController.js`; aucun `HMAC_SECRET` distinct n'est lu par l'API. Render
doit donc conserver le secret existant sous `JWT_SECRET` (sans rotation).

## 4. Vérifier et récupérer l'URL pour l'application

1. Attendez que le déploiement Render soit marqué **Live**.
2. Ouvrez l'adresse HTTPS du service suivie de `/health` dans le navigateur du
   téléphone. Le résultat attendu est `{"status":"ok"}`. Si Render signale un
   échec, vérifiez d'abord `DATABASE_URL`, `PGSSL` et les variables obligatoires
   dans les journaux du service.
3. Copiez l'adresse de base HTTPS du service, sans `/health`, par exemple
   `https://<nom-du-service>.onrender.com`.
4. Définissez cette adresse comme `EXPO_PUBLIC_API_URL` pour la compilation
   mobile. L'application ajoute elle-même les chemins `/api/v1/...`.
5. Pour le workflow GitHub de génération APK, ajoutez aussi cette URL dans
   **Settings → Secrets and variables → Actions** sous le nom
   `EXPO_PUBLIC_API_URL`, puis relancez le workflow de build Android.

`EXPO_PUBLIC_API_URL` est intégrée à l'application mobile et n'est pas une
variable à mettre sur le service backend Render. Les valeurs `EXPO_PUBLIC_*`
ne doivent pas contenir de secrets serveur.
