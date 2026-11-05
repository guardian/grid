import { expect, it } from "vitest";
import { getImageBorderColour } from "./image-borders";
import type { Image } from "@/types/image";

it("gives every owned-photographer category, including Grid's publisher replacement, the photographer border", () => {
  for (const category of ["staff-photographer", "contract-photographer", "commissioned-photographer", "publisher-photographer"]) {
    expect(getImageBorderColour({ usageRights: { category } } as unknown as Image)).toBe("#005689");
  }
  expect(getImageBorderColour({ usageRights: { category: "publisher-illustrator" } } as unknown as Image)).toBeUndefined();
});
