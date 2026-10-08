// Records the film: loads stage.html in a hidden window, steps its clock one
// frame at a time and saves every frame as a PNG.
//
//   FILM_DIR=<assembled film folder> OUT_DIR=<frames folder> electron record.cjs
//
// PREVIEW="3.5,9,14" saves only the frames at those times (seconds), for checking.
const { app, BrowserWindow } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const FILM_DIR = path.resolve(process.env.FILM_DIR)
const OUT_DIR = path.resolve(process.env.OUT_DIR)
const FPS = Number(process.env.FPS || 30)
const PREVIEW = process.env.PREVIEW ? process.env.PREVIEW.split(',').map(Number) : null
const WIDTH = 1920, HEIGHT = 1080 // saved frame size

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(FILM_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (!file.startsWith(FILM_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

app.whenReady().then(async () => {
  const server = await serve()
  const win = new BrowserWindow({
    width: 1440, height: 810, useContentSize: true, show: false, frame: false,
    focusable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { backgroundThrottling: false },
  })
  // macOS doesn't paint windows that are never shown, so show it, fully
  // transparent: it renders and can be captured without appearing on screen.
  win.setOpacity(0)
  win.showInactive()
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning' || process.env.FILM_DEBUG) console.log(`[page] ${e.message}`) })
  await win.loadURL(`http://127.0.0.1:${server.address().port}/stage.html`)
  const js = (code) => win.webContents.executeJavaScript(code)
  for (let i = 0; i < 600 && !(await js('window.__filmReady === true')); i++) await new Promise((r) => setTimeout(r, 50))
  if (!(await js('window.__filmReady === true'))) {
    console.error('Film never became ready:', await js(`JSON.stringify({ url: location.href, body: document.body?.innerHTML.length, fonts: document.fonts.status, frame: !!document.getElementById('clod'), clod: !!document.getElementById('clod')?.contentWindow?.__clod, clock: !!document.getElementById('clod')?.contentWindow?.__clock, state: document.getElementById('clod')?.contentDocument?.readyState })`))
    app.exit(1); return
  }

  const duration = await js('window.__film.duration')
  const total = Math.round(duration * FPS)
  const wanted = PREVIEW ? new Set(PREVIEW.map((s) => Math.round(s * FPS))) : null
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const started = Date.now()
  for (let f = 0; f < total; f++) {
    await js(`window.__film.step(${1000 / FPS})`)
    if (wanted && !wanted.has(f + 1)) continue
    const image = await win.webContents.capturePage()
    const png = image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' }).toPNG()
    const name = wanted ? `t${((f + 1) / FPS).toFixed(2)}.png` : `${String(f).padStart(5, '0')}.png`
    fs.writeFileSync(path.join(OUT_DIR, name), png)
    if (!wanted && f % 60 === 0) console.log(`frame ${f}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)`)
  }
  console.log(`Recorded ${wanted ? wanted.size : total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`)
  server.close()
  app.exit(0)
})
