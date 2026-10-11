export const isOtpTestPhone = (phoneNumber, configuration) =>
  configuration.otpTestMode &&
  configuration.nodeEnv !== "production" &&
  configuration.otpTestAllowlist.includes(phoneNumber);
