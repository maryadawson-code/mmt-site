/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './templates/**/*.html',
    './build.js',
  ],
  theme: {
    extend: {
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
