import { describe, it, expect } from "vitest";
import {
  FIELD_REGISTRY,
  FIELDS_BY_ID,
  COLUMN_CQL_KEYS,
  SORTABLE_FIELDS,
  DESC_BY_DEFAULT,
  DEFAULT_HIDDEN_COLUMNS,
  getFieldRawValue,
  getFieldDisplayValue,
} from "./field-registry";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const FIXTURE: Image = {
  id: "test-123",
  uploadTime: "2026-03-20T14:30:00.000Z",
  uploadedBy: "jane.doe@guardian.co.uk",
  lastModified: "2026-03-21T09:15:00.000Z",
  source: {
    mimeType: "image/jpeg",
    dimensions: { width: 4000, height: 3000 },
    orientedDimensions: { width: 3000, height: 4000 },
  },
  metadata: {
    title: "A cat on a mat",
    description: "A fluffy tabby cat sitting on a doormat",
    byline: "Robbie Stephenson",
    credit: "Getty Images",
    source: "Rex Features",
    subjects: ["nature", "lifestyle"],
    peopleInImage: ["Alice", "Bob"],
    dateTaken: "2026-03-19T10:00:00.000Z",
    subLocation: "Kings Cross",
    city: "London",
    state: "England",
    country: "United Kingdom",
    imageType: "Photograph",
  },
  usageRights: { category: "staff-photographer" },
  uploadInfo: { filename: "cat_on_mat.jpg" },
  fileMetadata: {
    iptc: { "Edit Status": "ORIGINAL" },
    colourModel: "RGB",
  },
};

const SPARSE: Image = {
  id: "sparse",
  uploadTime: "2026-01-01T00:00:00Z",
  uploadedBy: "test",
  source: { mimeType: "image/png", dimensions: { width: 100, height: 100 } },
  metadata: {},
};

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------
describe("FIELD_REGISTRY structure", () => {
  it("has unique IDs", () => {
    const ids = FIELD_REGISTRY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no empty labels", () => {
    for (const f of FIELD_REGISTRY) {
      expect(f.label.trim().length, `field ${f.id} has empty label`).toBeGreaterThan(0);
    }
  });

  it("FIELDS_BY_ID covers every registry entry", () => {
    expect(FIELDS_BY_ID.size).toBe(FIELD_REGISTRY.length);
  });

  it("every field with a sortKey appears in SORTABLE_FIELDS", () => {
    for (const f of FIELD_REGISTRY) {
      if (f.sortKey) {
        expect(SORTABLE_FIELDS[f.id], `${f.id} has sortKey but missing from SORTABLE_FIELDS`).toBe(f.sortKey);
      }
    }
  });

  it("every field with a cqlKey appears in COLUMN_CQL_KEYS", () => {
    for (const f of FIELD_REGISTRY) {
      if (f.cqlKey) {
        expect(COLUMN_CQL_KEYS[f.id], `${f.id} has cqlKey but missing from COLUMN_CQL_KEYS`).toBe(f.cqlKey);
      }
    }
  });

  it("every defaultHidden field appears in DEFAULT_HIDDEN_COLUMNS", () => {
    for (const f of FIELD_REGISTRY) {
      if (f.defaultHidden) {
        expect(DEFAULT_HIDDEN_COLUMNS, `${f.id} is defaultHidden but not in DEFAULT_HIDDEN_COLUMNS`).toContain(f.id);
      }
    }
  });

  it("DESC_BY_DEFAULT only contains sort keys that exist in the registry", () => {
    const allSortKeys = new Set(FIELD_REGISTRY.filter((f) => f.sortKey).map((f) => f.sortKey!));
    for (const key of DESC_BY_DEFAULT) {
      expect(allSortKeys, `DESC_BY_DEFAULT contains "${key}" which is not a sort key`).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Accessor logic — the tricky cases
// ---------------------------------------------------------------------------
describe("accessors", () => {
  it("uses oriented dimensions, not raw", () => {
    expect(getFieldRawValue("width", FIXTURE)).toBe("3000");
    expect(getFieldRawValue("height", FIXTURE)).toBe("4000");
  });

  it("falls back to raw dimensions when oriented absent", () => {
    expect(getFieldRawValue("width", SPARSE)).toBe("100");
  });

  it("strips image/ prefix from MIME type", () => {
    expect(getFieldRawValue("source_mimeType", FIXTURE)).toBe("jpeg");
  });

  it("joins list fields with comma-space", () => {
    expect(getFieldRawValue("subjects", FIXTURE)).toBe("nature, lifestyle");
    expect(getFieldRawValue("people", FIXTURE)).toBe("Alice, Bob");
  });

  it("joins location sub-fields fine→coarse", () => {
    expect(getFieldRawValue("location", FIXTURE)).toBe(
      "Kings Cross, London, England, United Kingdom"
    );
  });

  it("location sub-fields have correct CQL keys", () => {
    const loc = FIELDS_BY_ID.get("location")!;
    expect(loc.subFields!.map((sf) => sf.cqlKey)).toEqual([
      "location", "city", "state", "country",
    ]);
  });

  it("resolves alias fields via dot-path", () => {
    expect(getFieldRawValue("alias_editStatus", FIXTURE)).toBe("ORIGINAL");
    expect(getFieldRawValue("alias_colourModel", FIXTURE)).toBe("RGB");
  });

  it("returns raw ISO string for date fields (not formatted)", () => {
    expect(getFieldRawValue("uploadTime", FIXTURE)).toBe("2026-03-20T14:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
describe("getFieldDisplayValue", () => {
  it("formats dates for display", () => {
    expect(getFieldDisplayValue("uploadTime", FIXTURE)).toContain("20 Mar 2026");
  });

  it("strips image/ from MIME type", () => {
    expect(getFieldDisplayValue("source_mimeType", FIXTURE)).toBe("jpeg");
  });

  it("returns — for missing values", () => {
    expect(getFieldDisplayValue("metadata_credit", SPARSE)).toBe("—");
  });

  it("returns — for unknown field ID", () => {
    expect(getFieldDisplayValue("nonexistent", FIXTURE)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Missing-field safety
// ---------------------------------------------------------------------------
describe("sparse images", () => {
  it("do not crash any accessor", () => {
    for (const f of FIELD_REGISTRY) {
      expect(() => getFieldRawValue(f.id, SPARSE)).not.toThrow();
      expect(() => getFieldDisplayValue(f.id, SPARSE)).not.toThrow();
    }
  });
});
