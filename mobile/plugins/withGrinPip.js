const { withAndroidManifest } = require("expo/config-plugins");

module.exports = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const activity = modConfig.modResults.manifest.application?.[0]?.activity?.find(
      (entry) => entry.$?.["android:name"]?.endsWith(".MainActivity"),
    );
    if (!activity) {
      throw new Error("Impossible de trouver l'activité Android MainActivity pour activer le PiP.");
    }

    activity.$ ??= {};
    activity.$["android:supportsPictureInPicture"] = "true";
    activity.$["android:resizeableActivity"] = "true";
    const requiredChanges = [
      "screenSize",
      "smallestScreenSize",
      "screenLayout",
      "orientation",
    ];
    const existingChanges = (activity.$["android:configChanges"] ?? "")
      .split("|")
      .filter(Boolean);
    activity.$["android:configChanges"] = [
      ...new Set([...existingChanges, ...requiredChanges]),
    ].join("|");

    return modConfig;
  });
