/**
 * useDocumentTitle — updates `document.title` based on the current search
 * query and the new-images ticker count.
 *
 * Mirrors kahuna's `ui-title` directive behaviour:
 * - No query:              "search | the Grid"
 * - With query:            "cats | the Grid"
 * - With new images:       "(5 new)  cats | the Grid"
 */

import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";

const SUFFIX = "the Grid";

export function useDocumentTitle() {
  const { query } = useSearch({ from: "/search" });
  const newCount = useSearchStore((s) => s.newCount);

  useEffect(() => {
    const prefix = query?.trim() || "search";
    const base = `${prefix} | ${SUFFIX}`;
    document.title = newCount > 0 ? `(${newCount} new)  ${base}` : base;

    return () => {
      document.title = SUFFIX;
    };
  }, [query, newCount]);
}


