/** Finish in-flight work before the caller starts cleanup, keeping the original failure. */
export async function settleAll<Results extends unknown[]>(
  actions: { [Index in keyof Results]: () => Promise<Results[Index]> },
  startup?: AbortController,
): Promise<Results> {
  startup?.signal.throwIfAborted();
  const pending = actions.map(async (action) => action());

  try {
    const results = await Promise.all(pending);
    startup?.signal.throwIfAborted();
    return results as Results;
  } catch (error) {
    startup?.abort(error);
    await Promise.allSettled(pending);
    throw startup ? startup.signal.reason : error;
  }
}

interface Stoppable {
  stop(): Promise<unknown>;
}

interface StackReporter {
  step<T>(name: string, run: () => Promise<T>): Promise<T>;
}

/** Settle outstanding starts before calling stopAll, so each attempt has the right cleanup. */
export function createStackResources(reporter: StackReporter) {
  const containers: { name: string; stop: () => Promise<unknown> }[] = [];
  let network: Stoppable | undefined;
  let cleanup: Promise<number> | undefined;

  function startNetwork<Network extends Stoppable>(start: () => Promise<Network>): Promise<Network> {
    return reporter.step('create:network', async () => {
      const started = await start();
      network = started;

      return started;
    });
  }

  function startContainer<Container extends Stoppable>(
    name: string,
    start: () => Promise<Container>,
    removeFailedStart: () => Promise<unknown>,
  ): Promise<Container> {
    return reporter.step(`start:${name}`, async () => {
      const resource = { name, stop: removeFailedStart };
      containers.push(resource);
      const container = await start();
      resource.stop = () => container.stop();

      return container;
    });
  }

  async function stopResources(): Promise<number> {
    let failures = 0;

    async function attempt(label: string, work: () => Promise<unknown>): Promise<void> {
      try {
        await reporter.step(label, work);
      } catch {
        // The step reports the failure. Continue so every owned resource gets a stop attempt.
        failures++;
      }
    }

    await Promise.all(containers.map(({ name, stop }) => attempt(`stop:${name}`, stop)));

    const ownedNetwork = network;
    if (ownedNetwork) await attempt('remove:network', () => ownedNetwork.stop());

    return failures;
  }

  function stopAll(): Promise<number> {
    return cleanup ??= stopResources();
  }

  return { startNetwork, startContainer, stopAll };
}
