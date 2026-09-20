import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://signalroom-nu.vercel.app',
  output: 'static',
  integrations: [sitemap()],
  prefetch: true,
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
