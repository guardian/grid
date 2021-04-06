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
  mmm: ImageMetadata,
  fileMetadata: unknown
): WriteTags => {
  const meta = Object.fromEntries(Object.entries(([k,v]:[string, string])=>[k,`${v}äaaïîé`]))
  const legal: Partial<WriteTags> = {
    DateTimeOriginal: meta.dateTaken,
    Description: meta.description,
    Credit: meta.credit,
    Artist: meta.byline,
    "By-lineTitle": meta.bylineTitle,
    Title: meta.title,
    CopyrightNotice: meta.copyright,
    OriginalTransmissionReference: meta.suppliersReference,
    Source: meta.source,
    Keywords: [meta.keywords].join(';'),
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
    "XMP-photoshop:Source": meta.source
  };
  return impartial({ ...legal, ...specificAndLimited });
};
