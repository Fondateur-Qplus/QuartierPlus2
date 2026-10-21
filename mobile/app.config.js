const iosGoogleClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
const iosGoogleClientMatch = iosGoogleClientId.match(
  /^(\d+-[a-z0-9-]+)\.apps\.googleusercontent\.com$/i,
);

if (iosGoogleClientId && !iosGoogleClientMatch) {
  console.warn(
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID invalide ; la configuration Google iOS est ignorée.",
  );
}

const googleSignInPlugin = iosGoogleClientMatch
  ? [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: `com.googleusercontent.apps.${iosGoogleClientMatch[1]}`,
      },
    ]
  : null;

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
  extra: {
    ...config.extra,
    commitSha: process.env.EXPO_PUBLIC_GIT_SHA ?? "unknown",
  },
  plugins: [
    ...config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "react-native-maps"
        ? [
            plugin[0],
            {
              ...plugin[1],
              androidGoogleMapsApiKey:
                process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
            },
          ]
        : plugin,
    ),
    ...(googleSignInPlugin ? [googleSignInPlugin] : []),
  ],
});
