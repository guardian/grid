import { cp, mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { createLibrary } from './library.ts';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const outputDir = path.resolve(directory, '../dist/feature-library');

export async function buildLibrary(reportDir = path.resolve(directory, '../playwright-report')): Promise<string> {
  const { manifest, media, warnings } = await createLibrary({
    featuresDir: path.resolve(directory, '../features'), reportDir,
  });
  await mkdir(path.join(outputDir, 'media'), { recursive: true });
  await build({
    entryPoints: [path.join(directory, 'app.tsx')],
    outfile: path.join(outputDir, 'app.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    tsconfig: path.join(directory, 'tsconfig.json'),
  });
  await Promise.all(['index.html', 'styles.css'].map((file) => cp(path.join(directory, file), path.join(outputDir, file))));
  await cp(path.resolve(directory, '../../kahuna/public/images/grid-logo.svg'), path.join(outputDir, 'grid-logo.svg'));
  const fontsDir = path.resolve(directory, '../../kahuna/public/stylesheets/fonts');
  await mkdir(path.join(outputDir, 'fonts'), { recursive: true });
  await Promise.all([
    ['open-sans-v34-regular-latin_memvYaGs126MiZpBA-UvWbX2vVnXBbObjwSVTS-mu0SC55I.woff2', 'open-sans.woff2'],
    ['opensans-semibold-webfont.woff2', 'open-sans-semibold.woff2'],
  ].map(([source, destination]) => cp(path.join(fontsDir, source), path.join(outputDir, 'fonts', destination))));
  await rm(path.join(outputDir, 'icons.js'), { force: true });
  await Promise.all([...media].map(([destination, source]) => cp(source, path.join(outputDir, destination))));
  await writeFile(path.join(outputDir, 'library.json'), JSON.stringify(manifest));
  for (const file of await readdir(path.join(outputDir, 'media'))) {
    if (/^[a-f0-9]{16}\.(webm|mp4)$/.test(file) && !media.has(`media/${file}`)) {
      await unlink(path.join(outputDir, 'media', file));
    }
  }
  for (const warning of warnings) console.warn(warning);
  const scenarios = manifest.features.flatMap((feature) => feature.scenarios);
  console.log(`Feature library: ${manifest.features.length} features, ${scenarios.length} scenarios, ${media.size} videos.\nBuilt ${outputDir}`);
  return outputDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { report: { type: 'string' } } });
  await buildLibrary(values.report ? path.resolve(values.report) : undefined);
}