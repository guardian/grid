/**
 * StableImg — img element that guards against redundant src updates.
 *
 * Problem: React manages img.src via a prop. When commitStripReset copies the
 * swiped-to image's src to the center panel, React's subsequent re-render
 * writes the same URL again. Even though the value hasn't changed, the browser
 * re-enters the image load pipeline: img.complete resets to false, the decoded
 * bitmap is discarded, and the compositor shows the OLD texture until re-decode
 * finishes. On a phone doing 3 concurrent AVIF decodes, that takes 300ms+ —
 * long enough for the next swipe to animate with stale pixels (the
 * "duplicate image" bug).
 *
 * Fix: render <img> WITHOUT a src prop. Manage src imperatively in
 * useLayoutEffect (runs after DOM commit, before paint). Compare the resolved
 * URL against what the element already has — skip the write when they match.
 * commitStripReset's imperative write is thus preserved, img.complete stays
 * true, and the compositor shows the correct decoded image.
 */

import { useLayoutEffect, useRef, type ImgHTMLAttributes } from "react";

type StableImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** The image URL. Managed imperatively — only written when it actually changes. */
  src: string | undefined;
  /** Optional external ref (merged with internal). */
  imgRef?: React.RefObject<HTMLImageElement | null>;
};

export function StableImg({ src, imgRef, ...props }: StableImgProps) {
  const internalRef = useRef<HTMLImageElement>(null);

  // Merge external ref — keep both pointing to the same element.
  const setRef = (el: HTMLImageElement | null) => {
    (internalRef as React.MutableRefObject<HTMLImageElement | null>).current = el;
    if (imgRef) {
      (imgRef as React.MutableRefObject<HTMLImageElement | null>).current = el;
    }
  };

  useLayoutEffect(() => {
    const img = internalRef.current;
    if (!img) return;

    // commitStripReset sets data-committed after copying the swiped-to
    // image's src to the center panel. This flag tells us: "the correct
    // src is already set and decoded — don't touch it." Without this,
    // we'd re-set the URL (which may differ in imgproxy sizing params
    // despite being the same image), resetting img.complete to false.
    if (img.hasAttribute("data-committed")) {
      img.removeAttribute("data-committed");
      // Don't return — fall through to URL comparison. The committed src
      // is a thumbnail; the incoming src is full-res. We want the upgrade.
      // The thumbnail bitmap stays as compositor texture during full-res
      // decode — seamless progressive upgrade, no flash.
    }

    if (!src) {
      // Clear — no image to show.
      if (img.src) img.removeAttribute("src");
      return;
    }

    // Compare resolved URLs. img.src (property) always returns the full
    // absolute URL. Resolve the prop value the same way so the comparison
    // is apples-to-apples regardless of relative vs absolute input.
    try {
      const resolved = new URL(src, window.location.href).href;
      if (img.src === resolved) {
        return; // already correct — preserve img.complete
      }
    } catch {
      // Malformed URL — fall through to unconditional set.
    }

    img.src = src;
  }, [src]);

  // Render WITHOUT src — managed imperatively above.
  // eslint-disable-next-line jsx-a11y/alt-text -- caller provides alt via ...props
  return <img ref={setRef} {...props} />;
}
