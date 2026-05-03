/**
 * ImageMetadata -- shared metadata display for an image.
 *
 * Used in two contexts:
 *   1. ImageDetail sidebar (single-image view)
 *   2. Right side panel in grid/table view (shows focused image's metadata)
 *
 * Takes an Image and renders a definition list of its metadata fields.
 * No layout chrome (no <aside>, no width, no border) -- callers handle
 * their own container styling.
 *
 * Field order, layout (stacked vs inline), and visibility are all driven
 * by the field registry (DETAIL_PANEL_FIELDS). Section breaks are inserted
 * whenever the `group` changes between consecutive fields.
 *
 * Display rules replicate kahuna's layout:
 *   - Sections separated by solid #565656 dividers (kahuna's image-info__group
 *     border-bottom: 1px solid #565656) -- these are orientation landmarks
 *   - Fields with detailLayout: "stacked" render label above value
 *   - All other fields render INLINE (key 30% left, value 70% right)
 *   - Labels are bold (kahuna's .metadata-line__key { font-weight: bold })
 *   - Clickable values have a persistent underline (kahuna's
 *     .metadata-line__info a { border-bottom: 1px solid #999 })
 *   - Values are clickable search links (click = search, Shift = AND, Alt = exclude)
 *   - Empty fields are hidden (no editors in Phase 2)
 *   - Location sub-parts are individual search links
 *   - List fields (keywords, subjects, people) are rendered as search pills
 *   - Section padding ~10px (py-2.5) matches kahuna's image-info__group padding
 *
 * Primitives (ValueLink, MetadataSection, MetadataRow, MetadataBlock, FieldValue,
 * groupFieldsIntoSections, useMetadataSearch) live in metadata-primitives.tsx and
 * are shared with MultiImageMetadata.
 *
 * See kupua/exploration/docs/zz Archive/metadata-display-plan.md for the full design.
 */

import type { Image } from "@/types/image";
import { DETAIL_PANEL_FIELDS } from "@/lib/field-registry";
import {
  useMetadataSearch,
  MetadataSection,
  MetadataRow,
  MetadataBlock,
  FieldValue,
  groupFieldsIntoSections,
  Dash,
} from "./metadata-primitives";

const SECTIONS = groupFieldsIntoSections(DETAIL_PANEL_FIELDS);

// ---------------------------------------------------------------------------
// ImageMetadata — the full metadata display, driven by the field registry
// ---------------------------------------------------------------------------

interface ImageMetadataProps {
  image: Image;
}

export function ImageMetadata({ image }: ImageMetadataProps) {
  const onSearch = useMetadataSearch();

  return (
    <dl>
      {SECTIONS.map((section, sIdx) => (
        <MetadataSection key={sIdx}>
          {section.map((field) => {
            if (field.visibleWhen?.() === false) return null;

            const raw = field.accessor(image);
            const hasValue = Array.isArray(raw) ? raw.length > 0 : raw != null && raw !== "";

            if (!hasValue) {
              if (!field.showWhenEmpty) return null;
              const Layout = field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;
              return (
                <Layout key={field.id} label={field.label}>
                  <Dash />
                </Layout>
              );
            }

            const Layout = field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;
            return (
              <Layout key={field.id} label={field.label}>
                <FieldValue field={field} image={image} onSearch={onSearch} />
              </Layout>
            );
          })}
        </MetadataSection>
      ))}
    </dl>
  );
}

