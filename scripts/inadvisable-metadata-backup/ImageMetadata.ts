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
    Source: meta.source,
    "Sub-location": meta.subLocation,
    City: meta.city,
    Country: meta.country,
  };
  const specificAndLimited = {
    SupplementalCategories: meta.subjects,
    "IPTC:Credit":meta.credit,
    "XMP-iptcExt:PersonInImage": meta.peopleInImage,
    "XMP-gridImage:FileMetadata": JSON.stringify(fileMetadata),
    "XMP-photoshop:Credit": meta.credit,
    "XMP-photoshop:Instructions": meta.specialInstructions,
    "XMP-photoshop:Source": meta.source,
    "XMP-dc:subject": meta.keywords,
    "XMP-dc:description": meta.description,
    "XMP-dc:creator": meta.byline,
    "XMP-photoshop:AuthorsPosition": meta.bylineTitle,
    "XMP-photoshop:Headline": meta.title,
    "XMP-dc:Rights": meta.copyright,
    "XMP-photoshop:TransmissionReference": meta.suppliersReference,
  };
  return impartial({ ...legal, ...specificAndLimited });
};
