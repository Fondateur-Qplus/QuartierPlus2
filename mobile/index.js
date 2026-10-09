const { registerRootComponent } = require("expo");
const React = require("react");
const ErrorUtils = global.ErrorUtils;
const previousGlobalHandler = ErrorUtils?.getGlobalHandler?.();
let crashlyticsClient = null;

const reportSanitizedError = (message) => {
  if (!crashlyticsClient) return;
  try {
    crashlyticsClient.recordError(new Error(message));
  } catch {
    console.error("Impossible de transmettre l'erreur à Crashlytics.");
  }
};

const reportGlobalError = (isFatal) => {
  reportSanitizedError(`Unhandled JavaScript error; fatal=${isFatal}`);
};

if (ErrorUtils?.setGlobalHandler) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportGlobalError(isFatal);
    previousGlobalHandler?.(error, isFatal);
  });
}

let crashlyticsStartupPromise;
try {
  const crashlytics = require("@react-native-firebase/crashlytics").default;
  crashlyticsClient = crashlytics();
  const version = require("./app.json").expo.version;
  crashlyticsStartupPromise = crashlyticsClient
    .setCrashlyticsCollectionEnabled(true)
    .then(() => {
      crashlyticsClient.log("app_start");
      crashlyticsClient.recordError(
        new Error(`startup_ok version=${version}`),
      );
      return null;
    })
    .catch(() => {
      console.error("Impossible d'initialiser la collecte Crashlytics.");
      return "Firebase/Crashlytics n'a pas pu être initialisé.";
    });
} catch {
  console.error("Impossible de charger Firebase Crashlytics.");
  crashlyticsStartupPromise = Promise.resolve(
    "Firebase/Crashlytics n'a pas pu être initialisé.",
  );
}

const StartupRoot = require("./src/startup/StartupRoot").default;
registerRootComponent(() =>
  React.createElement(StartupRoot, {
    crashlyticsClient,
    crashlyticsStartupPromise,
  }),
);
