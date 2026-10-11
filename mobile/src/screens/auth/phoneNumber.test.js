import { formatPhoneNumberE164 } from "./phoneNumber";

describe("formatPhoneNumberE164", () => {
  it("adds the selected country prefix to a local number", () => {
    expect(formatPhoneNumberE164("56119567", "+226")).toBe("+22656119567");
  });

  it("cleans punctuation and the national trunk prefix", () => {
    expect(formatPhoneNumberE164("05 61-19-567", "+226")).toBe("+22656119567");
  });

  it("does not duplicate the selected prefix on an international number", () => {
    expect(formatPhoneNumberE164("+226 56 11 95 67", "+226")).toBe("+22656119567");
    expect(formatPhoneNumberE164("0022656119567", "+226")).toBe("+22656119567");
  });

  it("rejects an international number with a different country prefix", () => {
    expect(() => formatPhoneNumberE164("+225 56 11 95 67", "+226")).toThrow(
      "Le pays sélectionné ne correspond pas à l’indicatif téléphonique.",
    );
  });
});
