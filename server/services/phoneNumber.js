import { parsePhoneNumberFromString } from "libphonenumber-js";

export const normalizePhoneNumberE164 = (value) => {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/^00/, "+");
  if (!input.startsWith("+")) return null;
  const phone = parsePhoneNumberFromString(input, { extract: false });
  return phone?.isValid() ? phone.number : null;
};

export const detectPhoneCountry = (value) => {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/^00/, "+");
  const phone = parsePhoneNumberFromString(input, { extract: false });
  return phone?.isValid() ? phone.country ?? null : null;
};
