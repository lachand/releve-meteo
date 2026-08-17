import react from '@vitejs/plugin-react';
import { build as viteBuild, defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Un identifiant different a chaque invocation du build : deux
// deploiements ne doivent jamais partager de cache (SERVICE_WORKER.md
// section 2), meme deux deploiements du meme commit.
const buildId = Date.now().toString(36);

/**
 * Compile `src/pwa/sw.ts` en un second bundle independant, sorti a la
 * racine du domaine (`dist/sw.js`), et lui injecte le manifeste de
 * precache des assets hashes du build principal. Ne s'execute qu'au
 * build de production (SERVICE_WORKER.md section 1 et 3).
 */
function serviceWorkerPlugin(): Plugin {
  const precacheAssets: string[] = [];
  let outDir = 'dist';
  let root = '.';
  return {
    name: 'meteo-fr-service-worker',
    apply: 'build',
    configResolved(resolvedConfig) {
      // Reprend la resolution du build principal (y compris --outDir en
      // ligne de commande) pour que le second bundle atterrisse toujours
      // au meme endroit que le shell qu'il precache.
      outDir = resolvedConfig.build.outDir;
      root = resolvedConfig.root;
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.fileName.startsWith('assets/') && !file.fileName.endsWith('.map')) {
          precacheAssets.push(`/${file.fileName}`);
        }
      }
    },
    async closeBundle() {
      await viteBuild({
        configFile: false,
        root,
        define: {
          __BUILD_ID__: JSON.stringify(buildId),
          __BUILD_MANIFEST_ASSETS__: JSON.stringify(precacheAssets),
        },
        build: {
          outDir,
          emptyOutDir: false,
          minify: true,
          rollupOptions: {
            input: 'src/pwa/sw.ts',
            output: {
              entryFileNames: 'sw.js',
              format: 'iife',
            },
          },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
});
