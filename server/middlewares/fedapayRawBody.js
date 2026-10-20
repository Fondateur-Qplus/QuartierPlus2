export const captureFedaPayRawBody = (request, _response, buffer) => {
  if (
    request.originalUrl.startsWith("/api/v1/payments/fedapay-webhook") ||
    request.originalUrl.startsWith("/v1/payments/fedapay-webhook")
  ) {
    request.rawBody = Buffer.from(buffer);
  }
};
