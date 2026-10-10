const { registerRootComponent } = require("expo");
const React = require("react");
const ErrorUtils = global.ErrorUtils;
const previousGlobalHandler = ErrorUtils?.getGlobalHandler?.();
let firebaseStartupError = null;
let crashlyticsClient = null;

const reportSanitizedError = (message) => {
  if (!crashlyticsClient) return;
  try {
    crashlyticsClient.recordError(new Error(message));
  } catch {
    console.error("Impossible de transmettre l'erreur à Crashlytics.");
  }
};

try {
  const firebase = require("@react-native-firebase/app").default;
  firebase.app();
} catch (error) {
  firebaseStartupError = error;
  console.warn("Firebase natif est indisponible au démarrage.");
}

const reportGlobalError = (isFatal) => {
  reportSanitizedError(`Unhandled JavaScript error; fatal=${isFatal}`);
};

if (ErrorUtils?.setGlobalHandler) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportGlobalError(isFatal);
    previousGlobalHandler?.(error, isFatal);
  });
}

let crashlyticsStartupPromise = Promise.resolve(null);
if (firebaseStartupError) {
  crashlyticsStartupPromise = Promise.resolve(
    new Error("Crashlytics indisponible car Firebase n'a pas démarré."),
  );
} else {
  try {
    const crashlytics = require("@react-native-firebase/crashlytics").default;
    crashlyticsClient = crashlytics();
    crashlyticsStartupPromise = crashlyticsClient
      .setCrashlyticsCollectionEnabled(true)
      .then(() => null)
      .catch((error) => {
        console.warn("Crashlytics est indisponible au démarrage.");
        return error;
      });
  } catch (error) {
    console.warn("Impossible de charger Crashlytics.");
    crashlyticsStartupPromise = Promise.resolve(error);
  }
}

const StartupRoot = require("./src/startup/StartupRoot").default;
registerRootComponent(() =>
  React.createElement(StartupRoot, {
    crashlyticsClient,
    firebaseStartupError,
    crashlyticsStartupPromise,
  }),
);
