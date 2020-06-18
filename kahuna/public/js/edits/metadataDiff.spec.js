import { getMetadataDiff } from './metadataDiff';

describe('metadataDiff', () => {
  it("handles an additional field", () => {
    const initial = { otherField: "value 2" };
    const changed = { field: "changed", otherField: "value 2" };
    const expected = { field: "changed" };
    const diff = getMetadataDiff({ data: { originalMetadata: initial } }, changed);
    expect(diff).toStrictEqual(expected);
  });

  it("finds a changed string field", () => {
    const initial = { field: "value", otherField: "value 2" };
    const changed = { field: "changed", otherField: "value 2" };
    const expected = { field: "changed" };
    const diff = getMetadataDiff({ data: { originalMetadata: initial } }, changed);
    expect(diff).toStrictEqual(expected);
  });

  it("finds a changed string field in the presence of an array", () => {
    const initial = { field: "value", array1: ["value 2"] };
    const changed = { field: "changed", array2: ["value 2"] };
    const expected = { field: "changed" };
    const diff = getMetadataDiff({ data: { originalMetadata: initial } }, changed);
    expect(diff).toStrictEqual(expected);
   });

  it("discards an array field", () => {
    const initial = { field: "value", keywords: ["value 2"] };
    const changed = { field: "changed", keywords: ["value 2","value 3"] };
    const expected = { field: "changed" };
    const diff = getMetadataDiff({ data: { originalMetadata: initial } }, changed);
    expect(diff).toStrictEqual(expected);
  });

  it("replaces an undefined field which was previously defined with an empty", () => {
    const initial = { field: "value", otherField: "value 2" };
    const changed = { field: undefined, otherField: "value 2" };
    const expected = { field: "" };
    const diff = getMetadataDiff({ data: { originalMetadata: initial } }, changed);
    expect(diff).toStrictEqual(expected);
  });
});
