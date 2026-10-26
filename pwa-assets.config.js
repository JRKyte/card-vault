import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#15172B' } },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#15172B' } },
  },
  images: ['public/icon.svg'],
})
