module.exports = ({ config }) => ({
  ...config,
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
