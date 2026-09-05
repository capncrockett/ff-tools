import type { Config } from 'tailwindcss'
import daisyui from 'daisyui'
export default {
  content: ['./src/web/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        dynasty: {
          primary: '#247760',
          secondary: '#60794e',
          accent: '#187968',
          neutral: '#2c4034',
          'base-100': '#ffffff',
          'base-200': '#f4f5f1',
          'base-300': '#e4eadc',
          'base-content': '#23342d',
          info: '#407c9b',
          success: '#d9eddb',
          warning: '#dbab54',
          error: '#f3d8d3',
        },
      },
    ],
  },
} satisfies Config
