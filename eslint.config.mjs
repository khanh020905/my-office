import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.next-*/**', 'out/**', '.demo-build/**', 'demo-site/**', 'data/**', 'public/assets/vendor/**', 'next-env.d.ts', 'test-results/**', 'test-results-*/**', 'playwright-report/**']),
  // `ready && start()` and `a ? b() : c()` as statements are this code base's style
  { rules: { '@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }] } },
  // `({ secret, ...rest }) => rest` drops a field on purpose
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true }] } },
  // the dictionaries are plain `export default { … }` objects, one per area
  { files: ['src/i18n/locales/**'], rules: { 'import/no-anonymous-default-export': 'off' } },
]);
