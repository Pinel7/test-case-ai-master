const { defineConfig } = require('vite');
const path = require('path');
const fs = require('fs');

// Ordered list of JS files to concatenate — must match <script> load order
const JS_FILES = [
  'modules/shared.js',
  'modules/auth.js',
  'global-init.js',
  'app.js',
  'modules/bugs.js',
  'modules/json-tools.js',
  'modules/toolkit.js',
  'modules/regex.js',
  'modules/sql.js',
  'modules/env.js',
  'modules/report.js',
  'modules/rtm.js',
  'modules/apitest.js',
  'modules/scriptgen.js',
  'modules/history.js',
  'modules/operations.js',
  'modules/shortcuts.js',
  'modules/export.js',
  'modules/library.js',
  'modules/admin.js',
  'editor.js',
];

function concatBundlePlugin() {
  const VIRTUAL_ID = 'virtual:bundle';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'concat-bundle',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      const base = path.resolve(__dirname, 'app/static/js');
      const parts = JS_FILES.map((file) => {
        const fullPath = path.join(base, file);
        if (!fs.existsSync(fullPath)) {
          this.warn(`File not found: ${fullPath}`);
          return `/* MISSING: ${file} */`;
        }
        return fs.readFileSync(fullPath, 'utf-8');
      });

      // Expose top-level function declarations that are referenced via window.xxx
      parts.push(`
(function() {
  /* bugs.js */
  window.initBugPage = typeof initBugPage !== 'undefined' ? initBugPage : undefined;
  window.refreshBugList = typeof refreshBugList !== 'undefined' ? refreshBugList : undefined;
  /* json-tools.js */
  window.initJsonTools = typeof initJsonTools !== 'undefined' ? initJsonTools : undefined;
  /* toolkit.js */
  window.initToolkit = typeof initToolkit !== 'undefined' ? initToolkit : undefined;
  /* regex.js */
  window.initRegexTester = typeof initRegexTester !== 'undefined' ? initRegexTester : undefined;
  /* sql.js */
  window.initSqlTool = typeof initSqlTool !== 'undefined' ? initSqlTool : undefined;
  window.initSqlCm = typeof initSqlCm !== 'undefined' ? initSqlCm : undefined;
  window.loadSqlSchema = typeof loadSqlSchema !== 'undefined' ? loadSqlSchema : undefined;
  window.schemaLoaded = typeof schemaLoaded !== 'undefined' ? schemaLoaded : undefined;
  /* env.js */
  window.initEnvManager = typeof initEnvManager !== 'undefined' ? initEnvManager : undefined;
  /* report.js */
  window.initReport = typeof initReport !== 'undefined' ? initReport : undefined;
  window.updateReport = typeof updateReport !== 'undefined' ? updateReport : undefined;
  /* rtm.js */
  window.initRtm = typeof initRtm !== 'undefined' ? initRtm : undefined;
  /* apitest.js */
  window.initApiTest = typeof initApiTest !== 'undefined' ? initApiTest : undefined;
  /* scriptgen.js */
  window.initScriptGen = typeof initScriptGen !== 'undefined' ? initScriptGen : undefined;
  /* auth.js */
  window.switchAuthMode = typeof switchAuthMode !== 'undefined' ? switchAuthMode : undefined;
  /* toolkit.js */
  window.switchToolkitTab = typeof switchToolkitTab !== 'undefined' ? switchToolkitTab : undefined;
  window.updateTimestamp = typeof updateTimestamp !== 'undefined' ? updateTimestamp : undefined;
  /* shortcuts.js */
  window.initShortcuts = typeof initShortcuts !== 'undefined' ? initShortcuts : undefined;
})();
`);
      return parts.join('\n;\n');
    },
  };
}

module.exports = defineConfig({
  base: '/static/dist/',
  build: {
    outDir: path.resolve(__dirname, 'app/static/dist'),
    emptyOutDir: true,
    manifest: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'virtual:bundle',
      treeshake: false,
      output: {
        entryFileNames: 'main-[hash].js',
        format: 'iife',
      },
    },
    cssMinify: false,
    minify: 'esbuild',
  },
  plugins: [concatBundlePlugin()],
});
