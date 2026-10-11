const { registerRootComponent } = require("expo");
const React = require("react");
const ErrorUtils = global.ErrorUtils;
const previousGlobalHandler = ErrorUtils?.getGlobalHandler?.();
let firebaseStartupError = null;
let crashlyticsClient = null;

console.info("app_start");

const reportSanitizedError = (message) => {
  if (!crashlyticsClient) return false;
  try {
    crashlyticsClient.recordError(new Error(message));
    return true;
  } catch {
    console.error("Impossible de transmettre l'erreur à Crashlytics.");
    return false;
  }
};

const safeErrorCode = (error) => {
  if (typeof error !== "object" || error === null) return "erreur inconnue";
  if (typeof error.code === "string") return error.code.slice(0, 80);
  if (typeof error.name === "string") return error.name.slice(0, 80);
  return "erreur inconnue";
};

try {
  const firebase = require("@react-native-firebase/app").default;
  firebase.app();
} catch (error) {
  firebaseStartupError = error;
  console.warn(
    `Firebase natif est indisponible au démarrage (${safeErrorCode(error)}).`,
  );
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
      .then(() => {
        if (!reportSanitizedError("startup_ok")) {
          throw new Error("Crashlytics ne peut pas enregistrer startup_ok.");
        }
        return null;
      })
      .catch((error) => {
        console.warn(
          `Crashlytics est indisponible au démarrage (${safeErrorCode(error)}).`,
        );
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
