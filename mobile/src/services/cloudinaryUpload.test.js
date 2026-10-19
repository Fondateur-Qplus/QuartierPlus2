jest.mock("axios", () => ({
  __esModule: true,
  default: {
    isAxiosError: jest.fn((error) => Boolean(error?.response)),
    post: jest.fn(),
  },
}));

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    constructor(uri) {
      this.uri = uri;
      this.size = 20 * 1024 * 1024 + 1;
    }

    slice(_start, _end, type) {
      return new Blob(["video-part"], { type });
    }
  },
}));

jest.mock("./api", () => ({
  API_BASE_URL: "https://api.example.test",
  apiFetch: jest.fn(async () => ({ ok: true, status: 204 })),
}));

const axios = require("axios").default;
const { uploadCloudinaryMedia } = require("./cloudinaryUpload");

describe("Cloudinary signed uploads", () => {
  beforeEach(() => {
    axios.post.mockReset();
    axios.post.mockResolvedValue({ data: { public_id: "user_video" } });
  });

  it("sends large videos as chunks with identical signed parameters", async () => {
    const signature = {
      apiKey: "public-api-key",
      cloudName: "test-cloud",
      folder: "quartierplus/posts",
      public_id: "user_video",
      resource_type: "video",
      signature: "signed-value",
      timestamp: 123,
    };
    const result = await uploadCloudinaryMedia(signature, {
      uri: "file:///video.mp4",
      name: "video.mp4",
      type: "video/mp4",
      size: 20 * 1024 * 1024 + 1,
    });

    expect(result).toEqual({ publicId: "user_video" });
    expect(axios.post).toHaveBeenCalledTimes(5);
    const firstCall = axios.post.mock.calls[0];
    expect(firstCall[0]).toBe(
      "https://api.cloudinary.com/v1_1/test-cloud/video/upload",
    );
    expect(firstCall[1].get("api_key")).toBe("public-api-key");
    expect(firstCall[1].get("timestamp")).toBe("123");
    expect(firstCall[1].get("folder")).toBe("quartierplus/posts");
    expect(firstCall[1].get("public_id")).toBe("user_video");
    expect(firstCall[1].get("signature")).toBe("signed-value");
    expect(firstCall[2].headers).toEqual({
      "Content-Range": "bytes 0-5242879/20971521",
      "X-Unique-Upload-Id": "user_video",
    });
    expect(axios.post.mock.calls.at(-1)[2].headers["Content-Range"]).toBe(
      "bytes 20971520-20971520/20971521",
    );
  });
});
