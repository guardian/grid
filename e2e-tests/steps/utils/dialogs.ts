import type { Page } from '@playwright/test';
import type { TestContext } from '../setup.ts';

const answering = new WeakSet<Page>();

/**
 * Record every alert and confirm the page raises in `testContext.dialogs`, and answer it with
 * `testContext.dialogAnswer` (dismiss by default, which answers "no" to a confirm). A listener
 * that leaves a dialog unanswered stalls the page, so this answers each one straight away.
 * Idempotent, so steps sharing a page can each call it.
 */
export function answerDialogs(page: Page, testContext: TestContext): void {
  if (answering.has(page)) return;
  answering.add(page);
  page.on('dialog', (dialog) => {
    testContext.dialogs.push(dialog.message());
    void (testContext.dialogAnswer === 'accept' ? dialog.accept() : dialog.dismiss());
  });
}
