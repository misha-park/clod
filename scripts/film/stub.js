// Stands in for Clod's main process (the preload API), so the real
// interface can run on the film set. Everything here is inert and made up.
;(function () {
  const noop = () => {}
  let tabs = 0
  const settings = {
    themeMode: 'dark', expandedUI: true, windowPosition: 'right', borderAnimation: true,
    thinkingAnimation: 'mitosis', hotkeyMode: 'double-option', setupCompleted: true, hotkeyTipDone: true,
    inputPlaceholder: 'Ask Claude anything…', preferredModel: 'sonnet', permissionMode: 'ask',
  }
  const api = {
    getSettingsSync: () => ({ settings, existed: true }),
    start: async () => ({ version: '2.1.285', auth: {}, projectPath: '/Users/sam/Downloads', homePath: '/Users/sam', defaultDir: '/Users/sam/Downloads' }),
    createTab: async () => ({ tabId: `film-${++tabs}` }),
    getTheme: async () => ({ isDark: true }),
    tabHealth: async () => ({ tabs: [] }),
    listSessions: async () => [],
    searchSessions: async () => [],
    loadSession: async () => [],
    listInstalledPlugins: async () => [],
    fetchMarketplace: async () => ({ plugins: [], error: null }),
    isVisible: async () => true,
    getPathForFile: () => '',
    // Lets a rehearsal of film mode pretend Clod was just shown.
    onWindowShown: (cb) => { window.__shown = cb; return noop },
  }
  window.clod = new Proxy(api, {
    get(target, key) {
      if (key in target) return target[key]
      if (typeof key === 'string' && key.startsWith('on')) return () => noop
      return async () => null
    },
  })
})()
