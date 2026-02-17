import { describe, it, expect, beforeEach } from "vitest";
import normalizeMimeType from "../normalizeMimeType";

describe("normalizeMimeType", () => {
  it("should normalize audio/x-wav to audio/wav", () => {
    expect(normalizeMimeType("audio/x-wav")).toBe("audio/wav");
  });

  it("should normalize audio/vnd.wave to audio/wav", () => {
    expect(normalizeMimeType("audio/vnd.wave")).toBe("audio/wav");
  });

  it("should normalize image/x-icon to image/vnd.microsoft.icon", () => {
    expect(normalizeMimeType("image/x-icon")).toBe("image/vnd.microsoft.icon");
  });

  it("should return unchanged MIME type if no normalization needed", () => {
    expect(normalizeMimeType("image/png")).toBe("image/png");
    expect(normalizeMimeType("video/mp4")).toBe("video/mp4");
  });

  it("should normalize game format types", () => {
    expect(normalizeMimeType("image/vtf")).toBe("image/x-vtf");
    expect(normalizeMimeType("image/qoi")).toBe("image/x-qoi");
    expect(normalizeMimeType("video/bink")).toBe("video/vnd.radgamettools.bink");
  });
});
