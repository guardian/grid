import { WriteTags } from "exiftool-vendored";

export interface ImageMetadata {
  dateTaken?: string;
  description?: string;
  credit?: string;
  byline?: string;
  bylineTitle?: string;
  title?: string;
  copyright?: string;
  suppliersReference?: string;
  source?: string;
  specialInstructions?: string;
  keywords: string[];
  subLocation?: string;
  city?: string;
  state?: string;
  country?: string;
  subjects: string[];
  peopleInImage: string[];
}

const impartial = (x: object): any =>
  Object.fromEntries(Object.entries(x).filter(([k]) => k !== undefined));

export const toWriteTags = (
  meta: ImageMetadata,
  fileMetadata: unknown
): WriteTags => {
  const legal: Partial<WriteTags> = {
    DateTimeOriginal: meta.dateTaken,
    Description: meta.description,
    Credit: meta.credit,
    "By-line": meta.byline,
    "By-lineTitle": meta.bylineTitle,
    Title: meta.title,
    CopyrightNotice: meta.copyright,
    OriginalTransmissionReference: meta.suppliersReference,
    Source: meta.source,
    SpecialInstructions: meta.specialInstructions,
    Keywords: meta.keywords,
    "Sub-location": meta.subLocation,
    City: meta.city,
    Country: meta.country,
  };
  const specificAndLimited = {
    SupplementalCategories: meta.subjects,
    "XMP-iptcExt:PersonInImage": meta.peopleInImage,
    "XMP-gridImage:FileMetadata": JSON.stringify(fileMetadata),
  };
  return impartial({ ...legal, ...specificAndLimited });
};
