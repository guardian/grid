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
  const meta: ImageMetadata = Object.fromEntries(Object.entries(mmm).map(([k,v]:[string, string])=>[k,`${v} (äaaïîé)`])) as any as ImageMetadata
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
    "XMP-iptcExt:PersonInImage": (mmm.peopleInImage||[]).map(v=>`${v} (äaaïîé)`),
    "XMP-gridImage:FileMetadata": JSON.stringify(fileMetadata),
    "XMP-photoshop:Credit": meta.credit,
    "XMP-photoshop:Instructions": meta.specialInstructions,
    "XMP-photoshop:Source": meta.source,
    "XMP-dc:subject": mmm.keywords.map(v=>`${v} (äaaïîé)`),
    "XMP-dc:description": meta.description,
    "XMP-dc:creator": meta.byline,
    "XMP-photoshop:AuthorsPosition": meta.bylineTitle,
    "XMP-photoshop:Headline": meta.title,
    "XMP-dc:Rights": meta.copyright,
    "XMP-photoshop:TransmissionReference": meta.suppliersReference,
  };
  return impartial({ ...legal, ...specificAndLimited });
};
