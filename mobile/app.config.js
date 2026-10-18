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
  plugins: config.plugins.map((plugin) =>
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
});
