export type TechnicalAvailability = "vérification" | "disponible" | "indisponible";

let firebase: TechnicalAvailability = "vérification";
let crashlytics: TechnicalAvailability = "vérification";
const listeners = new Set<() => void>();

export const setFirebaseAvailability = (available: boolean) => {
  firebase = available ? "disponible" : "indisponible";
  listeners.forEach((listener) => listener());
};

export const setCrashlyticsAvailability = (available: boolean) => {
  crashlytics = available ? "disponible" : "indisponible";
  listeners.forEach((listener) => listener());
};

export const getTechnicalAvailability = () => ({ firebase, crashlytics });

export const subscribeToTechnicalAvailability = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};