export const formatPhoneNumberE164 = (phone: string, countryPrefix: string) => {
  const value = phone.trim();
  const prefixDigits = countryPrefix.replace(/\D/g, "");
  if (!/^\+[1-9]\d{0,3}$/.test(countryPrefix)) {
    throw new Error("L’indicatif du pays sélectionné est invalide.");
  }

  let digits = value.replace(/\D/g, "");
  if (value.startsWith("+") || value.startsWith("00")) {
    if (value.startsWith("00")) digits = digits.slice(2);
    if (!digits.startsWith(prefixDigits)) {
      throw new Error("Le pays sélectionné ne correspond pas à l’indicatif téléphonique.");
    }
    digits = digits.slice(prefixDigits.length);
  }

  const nationalNumber = digits.replace(/^0+/, "");
  if (nationalNumber.length < 6 || nationalNumber.length > 12) {
    throw new Error("Saisissez un numéro de téléphone valide.");
  }

  const e164Number = `${countryPrefix}${nationalNumber}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164Number)) {
    throw new Error("Saisissez un numéro de téléphone valide.");
  }
  return e164Number;
};
