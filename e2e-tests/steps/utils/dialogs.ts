import type { Page } from '@playwright/test';
import type { TestContext } from '../setup.ts';

const answering = new WeakSet<Page>();

/**
 * Record every alert and confirm the page raises in `testContext.dialogs`, and answer it with
 * `testContext.dialogAnswer` (dismiss by default, which answers "no" to a confirm). A listener
 * that leaves a dialog unanswered stalls the page, so this answers each one straight away,
 * except a confirm raised inside `holdingConfirms`. Idempotent, so steps sharing a page can
 * each call it.
 */
export function answerDialogs(page: Page, testContext: TestContext): void {
  if (answering.has(page)) return;
  answering.add(page);
  page.on('dialog', (dialog) => {
    testContext.dialogs.push(dialog.message());
    if (dialog.type() === 'confirm' && testContext.holdingConfirms) {
      testContext.heldConfirm = dialog;
      return;
    }
    void (testContext.dialogAnswer === 'accept' ? dialog.accept() : dialog.dismiss());
  });
}

/**
 * Run `action`, leaving any confirm it raises unanswered so a later step can answer it with
 * `answerHeldConfirm`. The page, and so `action`, stalls until then, so this resolves as soon
 * as `action` finishes or raises a confirm.
 */
export async function holdingConfirms(
  page: Page,
  testContext: TestContext,
  action: () => Promise<unknown>,
): Promise<void> {
  answerDialogs(page, testContext);
  testContext.holdingConfirms = true;
  const raised = page.waitForEvent('dialog', (dialog) => dialog.type() === 'confirm');
  const done = action();
  // Whichever loses the race may never settle before the page closes.
  done.catch(() => {});
  raised.catch(() => {});
  testContext.heldAction = done;
  try {
    await Promise.race([done, raised]);
  } finally {
    testContext.holdingConfirms = false;
  }
}

/** Answer the confirm `holdingConfirms` held, and let the action that raised it finish. */
export async function answerHeldConfirm(testContext: TestContext, accept: boolean): Promise<void> {
  const confirm = testContext.heldConfirm;
  if (!confirm) throw new Error('no confirm was held by an earlier step');
  testContext.heldConfirm = undefined;
  await (accept ? confirm.accept() : confirm.dismiss());
  await testContext.heldAction;
}
