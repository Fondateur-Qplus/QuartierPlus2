import { Linking } from "react-native";
import { openProfileStore } from "../storage/profileStore";
import type { EmergencyServiceId } from "./voiceAssistant";

export type CountryEmergencyNumbers = {
  police: string;
  fire: string;
  medical: string;
};

export type EmergencyCountry = {
  name: string;
  code: string;
  emergencyNumbers: CountryEmergencyNumbers;
};

export const EMERGENCY_COUNTRIES: EmergencyCountry[] = [
  {
    name: "Burkina Faso",
    code: "BF",
    emergencyNumbers: { police: "17", fire: "18", medical: "112" },
  },
  {
    name: "Côte d'Ivoire",
    code: "CI",
    emergencyNumbers: { police: "110", fire: "180", medical: "185" },
  },
  {
    name: "Mali",
    code: "ML",
    emergencyNumbers: { police: "17", fire: "18", medical: "15" },
  },
  {
    name: "Sénégal",
    code: "SN",
    emergencyNumbers: { police: "17", fire: "18", medical: "1515" },
  },
];

const DEFAULT_COUNTRY = EMERGENCY_COUNTRIES[3];

export async function callOfficialEmergencyService(
  service: EmergencyServiceId,
) {
  const store = await openProfileStore();
  const country = await store.getCountry();
  const supportedCountry =
    EMERGENCY_COUNTRIES.find((entry) => entry.code === country?.code) ??
    DEFAULT_COUNTRY;
  const number = country?.emergencyNumbers?.[service] ??
    supportedCountry.emergencyNumbers[service];
  if (!/^[0-9]{1,20}$/.test(number)) {
    throw new Error("Le numéro d’urgence enregistré n’est pas valide.");
  }
  await Linking.openURL(`tel:${number}`);
}
