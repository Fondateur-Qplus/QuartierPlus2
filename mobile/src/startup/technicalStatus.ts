export type TechnicalAvailability = "vérification" | "disponible" | "indisponible";

let firebase: TechnicalAvailability = "vérification";
let crashlytics: TechnicalAvailability = "vérification";

export const setFirebaseAvailability = (available: boolean) => {
  firebase = available ? "disponible" : "indisponible";
};

export const setCrashlyticsAvailability = (available: boolean) => {
  crashlytics = available ? "disponible" : "indisponible";
};

export const getTechnicalAvailability = () => ({ firebase, crashlytics });