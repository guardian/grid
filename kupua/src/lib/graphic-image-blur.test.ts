import { describe, it, expect } from "vitest";
import { isImagePotentiallyGraphic } from "./graphic-image-blur";
import type { Image } from "@/types/image";

function makeImage(overrides: Partial<Image> = {}): Image {
  return {
    id: "test-id",
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "test-user",
    source: { file: "s3://bucket/key", mimeType: "image/jpeg", size: 1000, dimensions: { width: 100, height: 100 } },
    metadata: {
      description: undefined,
      title: undefined,
      specialInstructions: undefined,
      keywords: [],
      credit: "Test",
    },
    ...overrides,
  } as unknown as Image;
}

describe("isImagePotentiallyGraphic", () => {
  it("returns false for a clean image", () => {
    expect(isImagePotentiallyGraphic(makeImage())).toBe(false);
  });

  it("returns false when shouldBlur is false, even with graphic content", () => {
    const image = makeImage({ metadata: { description: "graphic content", credit: "Test" } as Image["metadata"] });
    expect(isImagePotentiallyGraphic(image, false)).toBe(false);
  });

  // --- Phrase scan ---

  it.each([
    ["graphic content", "description"],
    ["depicts death", "description"],
    ["dead child", "description"],
    ["child casualty", "description"],
    ["sensitive material", "title"],
    ["dead body", "title"],
    ["dead bodies", "specialInstructions"],
    ["body of", "description"],
    ["bodies of", "description"],
  ])('detects phrase "%s" in %s', (phrase, field) => {
    const fieldMap: Record<string, Partial<Image["metadata"]>> = {
      description: { description: `Photo shows ${phrase} from conflict zone` },
      title: { title: `Image: ${phrase}` },
      specialInstructions: { specialInstructions: `Warning: ${phrase}` },
    };
    const image = makeImage({ metadata: { credit: "Test", ...fieldMap[field] } as Image["metadata"] });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("detects phrase in keywords array", () => {
    const image = makeImage({
      metadata: { keywords: ["news", "dead child", "conflict"], credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("is case-insensitive for phrase matches", () => {
    const image = makeImage({
      metadata: { description: "GRAPHIC CONTENT warning", credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  // --- SMOUT ---

  it("detects SMOUT in specialInstructions (exact case)", () => {
    const image = makeImage({
      metadata: { specialInstructions: "SMOUT - do not publish", credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("does NOT trigger on lowercase 'smout' in specialInstructions", () => {
    const image = makeImage({
      metadata: { specialInstructions: "smout", credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(false);
  });

  it("detects SMOUT as uppercase keyword", () => {
    const image = makeImage({
      metadata: { keywords: ["news", "SMOUT"], credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("detects lowercase 'smout' keyword (toUpperCase comparison is case-insensitive)", () => {
    // kahuna: keyword?.toUpperCase() === "SMOUT" — so any case matches
    const image = makeImage({
      metadata: { keywords: ["smout"], credit: "Test" } as Image["metadata"],
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  // --- XMP flag ---

  it("detects pur:adultContentWarning in fileMetadata.xmp", () => {
    const image = makeImage({
      fileMetadata: { xmp: { "pur:adultContentWarning": "1" } },
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("treats any non-null pur:adultContentWarning value as graphic", () => {
    const image = makeImage({
      fileMetadata: { xmp: { "pur:adultContentWarning": false } },
    });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("returns false when xmp is present but pur:adultContentWarning is absent", () => {
    const image = makeImage({
      fileMetadata: { xmp: { "xmp:CreateDate": "2024-01-01" } },
    });
    expect(isImagePotentiallyGraphic(image)).toBe(false);
  });

  it("returns false when fileMetadata is absent", () => {
    const image = makeImage({ fileMetadata: undefined });
    expect(isImagePotentiallyGraphic(image)).toBe(false);
  });

  // --- aliases.adultContentWarning (media-api mode) ---

  it("detects adultContentWarning via aliases (media-api mode)", () => {
    const image = makeImage({ aliases: { adultContentWarning: "1" } });
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("treats any non-null aliases.adultContentWarning value as graphic", () => {
    const image = makeImage({ aliases: { adultContentWarning: "" } });
    // empty string is not null — still triggers
    expect(isImagePotentiallyGraphic(image)).toBe(true);
  });

  it("returns false when aliases is present but adultContentWarning is absent", () => {
    const image = makeImage({ aliases: { colourModel: "RGB" } });
    expect(isImagePotentiallyGraphic(image)).toBe(false);
  });
});
