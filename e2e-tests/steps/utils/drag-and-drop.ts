import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { TestImage } from '../setup.ts';

/**
 * `dnd-uploader` binds its handlers to `window` and decides what to do from
 * `dataTransfer.types`, so Playwright's drag helpers (which target elements) are no use.
 * These build a DataTransfer in page context and dispatch the events by hand.
 */
interface DragPayload {
  files?: TestImage[];
  uri?: string;
  /** Extra MIME types to advertise, e.g. Grid's own `application/vnd.mediaservice.*`. */
  types?: string[];
}

const dispatchDragEvent = async (page: Page, eventName: string, payload: DragPayload = {}) => {
  const files = (payload.files ?? []).map((file) => ({
    name: file.fileName,
    base64: readFileSync(file.path).toString('base64'),
  }));

  await page.evaluate(
    ({ eventName, files, uri, types }) => {
      const dataTransfer = new DataTransfer();

      for (const { name, base64 } of files) {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        dataTransfer.items.add(new File([bytes], name, { type: 'image/jpeg' }));
      }
      if (uri !== undefined) {
        dataTransfer.setData('text/uri-list', uri);
      }
      for (const type of types ?? []) {
        dataTransfer.setData(type, 'true');
      }

      window.dispatchEvent(new DragEvent(eventName, { dataTransfer, bubbles: true }));
    },
    { eventName, files, uri: payload.uri, types: payload.types },
  );
};

export const dragOver = (page: Page, payload: DragPayload) =>
  dispatchDragEvent(page, 'dragenter', payload);

export const dragAway = (page: Page) => dispatchDragEvent(page, 'dragleave');

export const drop = (page: Page, payload: DragPayload) => dispatchDragEvent(page, 'drop', payload);

/** Set by Kahuna on anything dragged from within the Grid (see main.js `vndMimeTypes`). */
export const GRID_IMAGE_MIME_TYPE = 'application/vnd.mediaservice.image+json';
