import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      globals: false,
      css: true,
      exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        // src/ui/** n'a pas de seuil chiffre (TESTING.md §1) : on y teste des
        // comportements via Testing Library, pas un pourcentage de lignes.
        // src/pwa/** est verifie par les tests e2e du service worker, pas ici.
        include: ['src/domain/**/*.ts', 'src/data/**/*.ts'],
        exclude: ['src/**/*.d.ts'],
        thresholds: {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
          'src/domain/**': {
            lines: 100,
            branches: 100,
            functions: 100,
            statements: 100,
          },
          'src/data/**': {
            branches: 90,
          },
        },
      },
    },
  }),
);
