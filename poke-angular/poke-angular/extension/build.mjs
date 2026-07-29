/**
 * Second half of the build.
 *
 * `ng build` produces the popup (popup.html, main.js, styles.css) plus
 * everything in public/. This bundles the three entry points that have no
 * business being Angular apps — the service worker, the content script and
 * the offscreen audio document — straight into the same dist folder.
 *
 * Type checking for these files happens during `ng build`: tsconfig.app.json
 * includes all of src, so a mistake in the worker fails the Angular build too.
 */

import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');

const entries = {
  background: 'src/worker/background.ts',
  content: 'src/worker/content.ts',
  offscreen: 'src/worker/offscreen.ts',
};

for (const [name, entry] of Object.entries(entries)) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${name}.js`,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'warning',
  });
}

// Angular writes this for SSR routing. Nothing in an extension reads it.
rmSync('dist/prerendered-routes.json', { force: true });

if (!existsSync('dist/manifest.json')) {
  console.error('\ndist/manifest.json is missing. Run `ng build` before this script.');
  process.exit(1);
}

/**
 * Chrome reports a missing file as "Could not load manifest", which tells you
 * nothing about which file. Check every path the manifest names, here.
 */
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
  'offscreen.html',
  'assets/chime.wav',
].filter(Boolean);

const missing = [...new Set(referenced)].filter((file) => !existsSync(`dist/${file}`));
if (missing.length) {
  console.error(`\nThe manifest points at files that are not in dist: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('\nBuilt to dist/ — load that folder in chrome://extensions');
console.log(readdirSync('dist').sort().join('  '));
