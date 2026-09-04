/**
 * Boots the Grid stack outside Playwright and holds it open until Ctrl-C.
 *
 * Set `GRID_PROXY=true` to also start the bundled Caddy reverse proxy, which
 * serves the https://*.media.<domain> domains for anyone without dev-nginx
 * running locally.
 */
import {
  DOMAIN,
  ELASTICSEARCH_PORT,
  GRID_IMAGE,
  LOCALSTACK_PORT,
  SERVICE_PORTS,
  URLS_FILE,
} from './constants.ts';
import { probeStack, startStack, stopStack } from './stack.ts';
import type { GridEnvironment } from './state.ts';

function banner(environment: GridEnvironment): string {
  const services = Object.keys(SERVICE_PORTS)
    .sort()
    .map((service) => `    ${service.padEnd(16)} http://localhost:${SERVICE_PORTS[service]}`)
    .join('\n');

  return [
    '',
    '  Grid is up.',
    '',
    `    kahuna (UI)      https://media.${DOMAIN}`,
    `    media-api        ${environment.mediaApiUrl}`,
    '',
    '  Services:',
    services,
    '',
    '  Infrastructure:',
    `    localstack       http://localhost:${LOCALSTACK_PORT}`,
    `    elasticsearch    http://localhost:${ELASTICSEARCH_PORT}`,
    '',
    `  Image:             ${GRID_IMAGE}`,
    `  Config:            ${environment.configDir}`,
    `  URLs:              ${URLS_FILE}`,
    `  Domains:           https://media.${DOMAIN} (via dev-nginx or GRID_PROXY=true)`,
    '',
    '  Press Ctrl-C to tear everything down.',
    '',
  ].join('\n');
}

async function dev(): Promise<void> {
  let environment: GridEnvironment | undefined;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // A second Ctrl-C exits immediately; Testcontainers' Ryuk reaper cleans up the rest.
    if (shuttingDown) {
      console.log('\nForcing exit.');
      process.exit(130);
    }
    shuttingDown = true;

    if (!environment) {
      // Interrupted mid-boot: startStack owns the containers, so leave them to Ryuk.
      console.log(`\nReceived ${signal} during startup; leaving cleanup to the Ryuk reaper.`);
      process.exit(130);
    }

    console.log(`\nReceived ${signal}, stopping the Grid stack...`);
    await stopStack(environment);
    console.log('Done.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // The host ports are fixed, so a second stack cannot coexist with the first.
  const { state, healthy } = await probeStack();
  if (state !== 'none') {
    throw new Error(
      `Ports ${healthy.join(', ')} are already serving Grid. Stop that stack before starting another.`,
    );
  }

  environment = await startStack({ proxy: process.env.GRID_PROXY === 'true' });
  console.log(banner(environment));

  // Hold the process open indefinitely.
  setInterval(() => {}, 2_000_000_000);
}

dev().catch((error) => {
  console.error(error);
  process.exit(1);
});
