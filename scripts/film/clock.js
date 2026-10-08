// A controllable clock for recording. Replaces the page's sense of time
// (performance.now, Date.now, timers, requestAnimationFrame and CSS
// animations) with one the recorder advances a frame at a time, so every
// frame of the film is exact and evenly spaced. Load it before anything else.
;(function () {
  const realRaf = window.requestAnimationFrame.bind(window)
  const realDateNow = Date.now
  const BASE = realDateNow()
  let now = 0
  let nextId = 1
  const timers = new Map() // id -> { at, fn, args, every }
  const frames = new Map() // id -> callback

  performance.now = () => now
  Date.now = () => BASE + now

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++
    timers.set(id, { at: now + Math.max(0, ms), fn, args, every: 0 })
    return id
  }
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++
    timers.set(id, { at: now + Math.max(1, ms), fn, args, every: Math.max(1, ms) })
    return id
  }
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id) }
  window.requestAnimationFrame = (cb) => { const id = nextId++; frames.set(id, cb); return id }
  window.cancelAnimationFrame = (id) => { frames.delete(id) }

  // CSS animations follow the clock too: each is paused and placed by hand.
  const started = new WeakMap()
  function placeCssAnimations() {
    for (const a of document.getAnimations()) {
      if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) { try { a.finish() } catch {} ; continue }
      if (!started.has(a)) { started.set(a, now); a.pause() }
      a.currentTime = now - started.get(a)
    }
  }

  function runTimersUntil(target) {
    for (;;) {
      let due = null
      for (const [id, t] of timers) if (t.at <= target && (!due || t.at < due[1].at)) due = [id, t]
      if (!due) break
      const [id, t] = due
      now = t.at
      if (t.every) t.at += t.every
      else timers.delete(id)
      try { typeof t.fn === 'function' ? t.fn(...t.args) : null } catch (err) { console.error(err) }
    }
  }

  window.__clock = {
    get now() { return now },
    /** Move time forward by ms: fire due timers, then one animation frame. */
    advance(ms) {
      const target = now + ms
      runTimersUntil(target)
      now = target
      const due = [...frames.values()]
      frames.clear()
      for (const cb of due) { try { cb(now) } catch (err) { console.error(err) } }
      placeCssAnimations()
    },
    /** Resolve after the browser has really painted (two real frames). */
    painted() { return new Promise((r) => realRaf(() => realRaf(() => r()))) },
  }
})()
