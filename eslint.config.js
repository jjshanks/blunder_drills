// ESLint: the recommended correctness rules, with no style rules. eslint-plugin-html lints the inline
// <script type="module"> in index.html and in the experiment pages.
import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default [
  // '.*/': hidden folders, such as local tool state and worktrees. ESLint does not read .gitignore.
  { ignores: ['.*/', 'node_modules/', 'test-results/', 'playwright-report/', 'docs/experiments/slm-bench/profile/'] },
  js.configs.recommended,
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  {
    // Node scripts. The tests and the benchmarks also send functions to the browser (page.evaluate), so they get browser globals too.
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
