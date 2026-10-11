import {
  EMBEDDED_PHONE_COUNTRIES,
  formatPhoneNumberE164,
  parseInternationalPhone,
} from "./phoneNumber";

describe("international phone normalization", () => {
  it("normalizes a plus-prefixed number to E.164 and detects its country", () => {
    expect(formatPhoneNumberE164("+226 56 11 95 67")).toBe("+22656119567");
    expect(parseInternationalPhone("+226 56 11 95 67")?.country?.name).toBe(
      "Burkina Faso",
    );
  });

  it("normalizes the international 00 prefix", () => {
    expect(formatPhoneNumberE164("0022656119567")).toBe("+22656119567");
  });

  it("requires the country calling code", () => {
    expect(() => formatPhoneNumberE164("56 11 95 67")).toThrow(
      "Saisissez l’indicatif, par exemple +226…",
    );
  });

  it("uses the embedded country table without a server request", () => {
    expect(EMBEDDED_PHONE_COUNTRIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "BF", name: "Burkina Faso", prefix: "+226" }),
        expect.objectContaining({ code: "CI", name: "Côte d’Ivoire", prefix: "+225" }),
        expect.objectContaining({ code: "SN", name: "Sénégal", prefix: "+221" }),
        expect.objectContaining({ code: "ML", name: "Mali", prefix: "+223" }),
      ]),
    );
  });
});
