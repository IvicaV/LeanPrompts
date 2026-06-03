import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx, defineManifest } from '@crxjs/vite-plugin'

const manifest = defineManifest({
  manifest_version: 3,
  name: "LeanPrompts - Studio",
  version: "1.0.0",
  author: "Ivica Vrgoc",
  description: "Professional, local-first development environment for AI prompts.",
  permissions: [
    "storage",
    "unlimitedStorage",
    "tabs",
    "activeTab",
    "scripting",
    "contextMenus",
    "system.display",
    "webNavigation"
  ],
  host_permissions: [
    "*://*/*"
  ],
  commands: {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+Shift+Q",
        "mac": "Alt+Shift+Q"
      },
      "description": "Activate Extension Popup"
    },
    "open-dashboard": {
      "suggested_key": {
        "default": "Alt+Shift+L",
        "mac": "Alt+Shift+L"
      },
      "description": "Open LeanPrompts Dashboard"
    },
    "create-prompt": {
      "suggested_key": {
        "default": "Alt+Shift+J",
        "windows": "Alt+Shift+J",
        "mac": "MacCtrl+Shift+J"
      },
      "description": "Create New Prompt"
    }
  },
  action: {
    "default_popup": "popup.html",
    "default_title": "Open LeanPrompts"
  },
  background: {
    "service_worker": "src/background.js",
    "type": "module"
  },
  icons: {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
  content_scripts: [
    {
      matches: [
        "*://*/*"
      ],
      js: ["src/content/main.js"],
      run_at: "document_start",
      all_frames: true
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
})
const injectScriptsPlugin = () => ({
  name: 'inject-scripts',
  transformIndexHtml(html) {
    return html.replace(
      '<!-- INJECT_SCRIPTS -->',
      '<script src="/themePreload.js"></script>'
    );
  },
  generateBundle(options, bundle) {
    for (const ObjectName of Object.entries(bundle)) {
      const key = ObjectName[0];
      const asset = ObjectName[1];
      if (key.endsWith('.html') && asset.type === 'asset' && typeof asset.source === 'string') {
        asset.source = asset.source.replace(
          '<!-- INJECT_SCRIPTS -->',
          '<script src="/themePreload.js"></script>'
        );
      }
    }
  }
});

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    injectScriptsPlugin()
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    sourcemap: false, // Keine Sourcemaps im Store-Build (erhöht Sicherheit und Datenschutz)
    minify: 'esbuild', // Standard-Minifizierung von Vite (CWS-konform, keine riskante Obfuszierung)
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        dashboard: 'index.html',
        popup: 'popup.html'
      }
    }
  }
})