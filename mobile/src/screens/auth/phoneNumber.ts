import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export type PhoneCountry = {
  code: string;
  name: string;
  prefix: string;
};

const countryNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["fr"], { type: "region" })
    : null;
const fallbackNames: Record<string, string> = {
  BF: "Burkina Faso",
  CI: "Côte d’Ivoire",
  ML: "Mali",
  SN: "Sénégal",
};

export const EMBEDDED_PHONE_COUNTRIES: PhoneCountry[] = getCountries()
  .map((code) => ({
    code,
    name: fallbackNames[code] ?? countryNames?.of(code) ?? code,
    prefix: `+${getCountryCallingCode(code)}`,
  }))
  .sort((left, right) => left.name.localeCompare(right.name, "fr"));

export const parseInternationalPhone = (
  value: string,
  manualCountryCode?: string,
) => {
  const input = value.trim().replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(input, {
    defaultCountry: manualCountryCode as CountryCode | undefined,
    extract: false,
  });
  if (!parsed || !parsed.isValid()) return null;

  const country = parsed.country
    ? EMBEDDED_PHONE_COUNTRIES.find((item) => item.code === parsed.country)
    : undefined;
  return {
    e164: parsed.number,
    country,
    callingCode: `+${parsed.countryCallingCode}`,
    possibleCountries: country
      ? []
      : EMBEDDED_PHONE_COUNTRIES.filter(
          (item) => item.prefix === `+${parsed.countryCallingCode}`,
        ),
  };
};

export const formatPhoneNumberE164 = (
  phone: string,
  manualCountryCode?: string,
) => {
  const value = phone.trim();
  if (!value.startsWith("+") && !value.startsWith("00")) {
    throw new Error("Saisissez l’indicatif, par exemple +226…");
  }
  const parsed = parseInternationalPhone(value, manualCountryCode);
  if (!parsed) throw new Error("Saisissez un numéro de téléphone valide.");
  if (!parsed.country && !manualCountryCode) {
    throw new Error("Choisissez le pays correspondant à cet indicatif partagé.");
  }
  return parsed.e164;
};
