/**
 * Renders long-running work as a listr2 task tree, so booting or tearing down the stack
 * shows which container or gate is currently being waited on instead of a silent terminal.
 *
 * Interactive terminals get the animated renderer; CI and piped output fall back to the
 * line-oriented `simple` renderer, which prints one line per task transition.
 */
import { Listr, PRESET_TIMER } from 'listr2';
import type { ListrTask } from 'listr2';

export type { ListrTask };

export interface RunTasksOptions {
  /** Keep going after a failed task. Used by teardown, where every step is best-effort. */
  exitOnError?: boolean;
}

/** Run `tasks` against `context`, which they mutate as they go, and return it. */
export async function runTasks<Ctx extends object>(
  tasks: ListrTask<Ctx>[],
  context: Ctx,
  options: RunTasksOptions = {},
): Promise<Ctx> {
  const runner = new Listr<Ctx>(tasks, {
    ctx: context,
    exitOnError: options.exitOnError ?? true,
    // The animated renderer redraws in place, which CI logs record as a wall of escape codes.
    fallbackRendererCondition: () => !!process.env.CI,
    rendererOptions: {
      timer: PRESET_TIMER,
      // Keep finished containers and services on screen: the completed list is the summary.
      collapseSubtasks: false,
      collapseErrors: false,
    },
    registerSignalListeners: false,
    fallbackRendererOptions: { timer: PRESET_TIMER },
  });

  return runner.run();
}

export const reportTo = (task: { output: string }) => (message: string) => { task.output = message; };