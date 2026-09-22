import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://signaldaily.cloud',
  output: 'static',
  integrations: [sitemap()],
  prefetch: true,
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
