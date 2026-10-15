export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly technicalDetails: string,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}
