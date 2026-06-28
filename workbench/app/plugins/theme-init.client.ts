const ALLOWED = new Set(['light', 'paper', 'eye', 'dark'])

export default defineNuxtPlugin({
  name: 'theme-init',
  enforce: 'pre',
  setup() {
    const saved = localStorage.getItem('huohuo_theme')
    const t = saved && ALLOWED.has(saved) ? saved : 'light'
    document.documentElement.dataset.theme = t
  },
})
