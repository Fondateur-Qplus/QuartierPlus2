const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error(
        "Le plugin Crashlytics de prévisualisation requiert app/build.gradle en Groovy.",
      );
    }

    const marker = "task.name.startsWith('uploadCrashlytics')";
    if (!modConfig.modResults.contents.includes(marker)) {
      modConfig.modResults.contents += `

tasks.configureEach { task ->
  if (task.name.startsWith('uploadCrashlytics')) {
    task.enabled = false
  }
}
`;
    }

    return modConfig;
  });
