/**
 * Animated "thinking" indicator shown while a response is running.
 *
 * Each style is a set of dots moving in 3D: a function of time returns points
 * as [x, y, z, size], and the canvas draws them with perspective, so dots
 * nearer the viewer (negative z) are bigger and drawn on top.
 */
import React, { useEffect, useRef } from 'react'

export type ThinkingAnimation = 'claude' | 'tetra' | 'origami' | 'leapfrog' | 'mitosis'

export const THINKING_ANIMATIONS: ThinkingAnimation[] = ['claude', 'tetra', 'origami', 'leapfrog', 'mitosis']

type Vec = number[] // [x, y, z, size?]
type Anim = (t: number) => Vec[]

const D2R = Math.PI / 180
const r2 = Math.SQRT1_2
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** Rotate p by angle a around the unit axis ax through the origin. */
function rot(p: Vec, ax: Vec, a: number): Vec {
  const [x, y, z] = p, [u, v, w] = ax, c = Math.cos(a), s = Math.sin(a), d = u * x + v * y + w * z
  return [
    u * d * (1 - c) + x * c + (-w * y + v * z) * s,
    v * d * (1 - c) + y * c + (w * x - u * z) * s,
    w * d * (1 - c) + z * c + (-v * x + u * y) * s,
  ]
}
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const rotAbout = (p: Vec, u: Vec, a: number, o: Vec): Vec => {
  const q = rot([p[0] - o[0], p[1] - o[1], p[2] - o[2]], u, a)
  return [q[0] + o[0], q[1] + o[1], q[2] + o[2]]
}

/** Chain timed segments into one looping animation. Each segment gets (progress 0..1, seconds in). */
type Segment = [number, (f: number, t: number) => Vec[]]
function timeline(segs: Segment[]): Anim & { period: number } {
  const period = segs.reduce((s, x) => s + x[0], 0)
  const fn = (t: number) => {
    t %= period
    for (const [d, f] of segs) {
      if (t < d) return f(t / d, t)
      t -= d
    }
    return segs[segs.length - 1][1](1, 0)
  }
  return Object.assign(fn, { period })
}

const SQUARE: Vec[] = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]]
const shrink = (pts: Vec[], f: number): Vec[] => pts.map((p) => [p[0] * (1 - f), p[1] * (1 - f), p[2] * (1 - f), p[3] ?? 1])

// ─── Claude: tumbling triangle → flipping square → spinning triangle ───

const claude: Anim = (() => {
  const FLIP = 0.62, HOLD = 0.08, N = 6, MORPH = 0.32, HOP = 0.34, HOPS = 12, R = 1.25, FP = FLIP + HOLD
  const tri: Vec[] = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3
    return [Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25]
  })
  const triAx: Vec[] = [[1, 0, 0], [0, r2, r2], [1, 0, 0], [0, -r2, r2]]
  const hopAng = [90]
  for (let i = 1; i < HOPS + 2; i++) hopAng.push(hopAng[i - 1] + (i % 3 === 0 ? -60 : 120))
  const ring = (a: number) => [Math.cos(a * D2R) * R, -Math.sin(a * D2R) * R]
  let triEnd = tri
  for (let j = 0; j < N; j++) triEnd = triEnd.map((p) => rot(p, triAx[j % 4], Math.PI))
  const spinEnd: Vec[] = [ring(hopAng[HOPS - 2]), ring(hopAng[HOPS - 1])].map(([x, y]) => [x, y, 0, 1])
  // Dots hop round a ring: the oldest shrinks inwards as a new one grows out.
  const spin = (t: number): Vec[] => {
    const k = Math.min(HOPS - 1, Math.floor(t / HOP)), f = ease(Math.min(1, (t - k * HOP) / HOP)), pts: Vec[] = []
    if (k >= 2) { const [x, y] = ring(hopAng[k - 2]); pts.push([lerp(x, x * 0.45, f), lerp(y, y * 0.45, f), 0, 1 - f]) }
    if (k >= 1) { const [x, y] = ring(hopAng[k - 1]); pts.push([x, y, 0, 1]) }
    const [x, y] = ring(hopAng[k])
    pts.push([lerp(x * 0.35, x, f), lerp(y * 0.35, y, f), 0, f])
    return pts
  }
  return timeline([
    [MORPH, (f) => shrink(tri, 1 - ease(f))],
    [N * FP, (_, t) => {
      const k = Math.min(N - 1, Math.floor(t / FP)), g = Math.min(1, (t - k * FP) / FLIP)
      let p = tri
      for (let j = 0; j < k; j++) p = p.map((q) => rot(q, triAx[j % 4], Math.PI))
      return p.map((q) => rot(q, triAx[k % 4], Math.PI * ease(g)))
    }],
    [MORPH, (f) => shrink(triEnd, ease(f))],
    [MORPH, (f) => shrink(SQUARE, 1 - ease(f))],
    [N * FP, (_, t) => {
      const k = Math.min(N - 1, Math.floor(t / FP)), g = Math.min(1, (t - k * FP) / FLIP)
      const ax = k % 2 ? [r2, -r2, 0] : [r2, r2, 0]
      return SQUARE.map((p) => rot(p, ax, Math.PI * ease(g)))
    }],
    [MORPH, (f) => shrink(SQUARE, ease(f))],
    [HOPS * HOP, (_, t) => spin(t)],
    [MORPH, (f) => shrink(spinEnd, ease(f))],
  ])
})()

// ─── Tetra: a tumbling tetrahedron, pausing where it looks like a square or a triangle ───

const tetra: Anim = (() => {
  const TET: Vec[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => p.map((c) => c * 0.8))
  const TET1 = TET.map((p) => rot(p, [-r2, r2, 0], Math.PI))
  const stops = [0, 54.7356, 125.2644, 180], moves = [0.38, 0.44, 0.38], hold = 0.14
  const flip = (k: number): Segment[] => {
    const base = k % 2 ? TET1 : TET, ax = k % 2 ? [r2, r2, 0] : [-r2, r2, 0], segs: Segment[] = []
    for (let i = 0; i < 3; i++) {
      segs.push([moves[i], (f) => base.map((p) => rot(p, ax, lerp(stops[i], stops[i + 1], ease(f)) * D2R))])
      segs.push([hold, () => base.map((p) => rot(p, ax, stops[i + 1] * D2R))])
    }
    return segs
  }
  return timeline([...flip(0), ...flip(1)])
})()

// ─── Origami: the square folds to a triangle, a line, then a dot, and unfolds ───

const origami: Anim = (() => {
  const folds = [
    { o: [0, 0, 0], u: [-r2, r2, 0], m: [0], sg: 1 },
    { o: [0, 0, 0], u: [r2, r2, 0], m: [3], sg: 1 },
    { o: [1, 0, 0], u: [1, 0, 0], m: [1, 3], sg: 1 },
  ]
  const states: Vec[][] = [SQUARE]
  for (const F of folds) {
    const S = states[states.length - 1]
    // Fold towards the viewer, so the moving dot grows as it passes.
    F.sg = cross(F.u, S[F.m[0]].map((c, i) => c - F.o[i]))[2] > 0 ? -1 : 1
    states.push(S.map((p, i) => (F.m.includes(i) ? rotAbout(p, F.u, Math.PI, F.o) : p)))
  }
  const fold = (i: number, f: number) =>
    states[i].map((p, j) => (folds[i].m.includes(j) ? rotAbout(p, folds[i].u, folds[i].sg * Math.PI * ease(f), folds[i].o) : p))
  const centre = (pts: Vec[]): Vec[] => {
    let mx = 0, my = 0
    pts.forEach((p) => { mx += p[0]; my += p[1] })
    mx /= pts.length; my /= pts.length
    return pts.map((p) => [p[0] - mx, p[1] - my, p[2], p[3] ?? 1])
  }
  const cycle = timeline([
    [0.5, (f) => fold(0, f)], [0.14, () => states[1]],
    [0.5, (f) => fold(1, f)], [0.14, () => states[2]],
    [0.5, (f) => fold(2, f)],
    [0.45, (f) => states[3].map((p) => [p[0], p[1], p[2], 1 + 0.4 * Math.sin(Math.PI * f)])],
    [0.45, (f) => fold(2, 1 - f)], [0.1, () => states[2]],
    [0.45, (f) => fold(1, 1 - f)], [0.1, () => states[1]],
    [0.45, (f) => fold(0, 1 - f)], [0.3, () => states[0]],
  ])
  // Each loop folds along a different diagonal.
  return (t: number) => {
    const a = (Math.floor(t / cycle.period) * Math.PI) / 2
    return centre(cycle(t)).map((p) => {
      const q = rot(p, [0, 0, 1], a)
      return [q[0] * 0.85, q[1] * 0.85, q[2] * 0.85, p[3]]
    })
  }
})()

// ─── Leapfrog: the back dot of three vaults over the others, round a ring ───

const leapfrog: Anim = (() => {
  const R = 1.2, HOP = 0.44, HOLD = 0.1
  const slot = (j: number): Vec => [Math.cos((-90 + 60 * j) * D2R) * R, Math.sin((-90 + 60 * j) * D2R) * R, 0]
  return (t: number) => {
    const P = HOP + HOLD, k = Math.floor(t / P), f = ease(Math.min(1, (t - k * P) / HOP))
    const a = (-90 + 60 * k + 180 * f) * D2R, b = Math.sin(Math.PI * f), r = R * (1 - 0.5 * b)
    return [slot(k + 1), slot(k + 2), [Math.cos(a) * r, Math.sin(a) * r, -0.75 * b]]
  }
})()

// ─── Mitosis: one dot divides into two, three, then four, flipping at each stage ───

const mitosis: Anim = (() => {
  const pol = (angs: number[], r: number): Vec[] => angs.map((a) => [Math.cos(a * D2R) * r, Math.sin(a * D2R) * r, 0])
  const R2 = 0.95, R3 = 1.2, R4 = Math.SQRT2, SQA = [45, 135, 225, 315]
  const split = (from: number[], ra: number, to: number[], rb: number, f: number): Vec[] => {
    const e = ease(f), r = lerp(ra, rb, e)
    return from.map((a, i) => {
      const g = lerp(a, to[i], e) * D2R
      return [Math.cos(g) * r, Math.sin(g) * r, 0]
    })
  }
  const flip = (pts: Vec[], ax: Vec) => (f: number) => pts.map((p) => rot(p, ax, Math.PI * ease(f)))
  const two = pol([0, 180], R2), three = pol([60, -60, 180], R3), four = pol(SQA, R4)
  return timeline([
    [0.4, (f) => [[0, 0, 0, 1 + 0.35 * Math.sin(Math.PI * f)]]],
    [0.45, (f) => split([0, 180], 0, [0, 180], R2, f)], [0.1, () => two],
    [0.62, flip(two, [0, 1, 0])], [0.1, () => two],
    [0.45, (f) => split([0, 0, 180], R2, [60, -60, 180], R3, f)], [0.1, () => three],
    [0.62, flip(three, [-1, 0, 0])], [0.1, () => three],
    [0.45, (f) => split([60, -60, 180, 180], R3, [45, -45, 135, 225], R4, f)], [0.1, () => four],
    [0.62, flip(four, [r2, r2, 0])], [0.08, () => four],
    [0.62, flip(four, [-r2, r2, 0])], [0.1, () => four],
    [0.45, (f) => four.map((p) => {
      const q = rot(p, [0, 0, 1], (ease(f) * Math.PI) / 2), s = 1 - ease(f)
      return [q[0] * s, q[1] * s, 0]
    })],
  ])
})()

const ANIMS: Record<ThinkingAnimation, { fn: Anim; camera: number }> = {
  claude: { fn: claude, camera: 3.2 },
  tetra: { fn: tetra, camera: 4.2 },
  origami: { fn: origami, camera: 4 },
  leapfrog: { fn: leapfrog, camera: 3.2 },
  mitosis: { fn: mitosis, camera: 3.2 },
}

interface Props {
  animation: ThinkingAnimation
  color: string
  /** Rendered width and height in CSS pixels */
  size?: number
}

export function ThinkingIndicator({ animation, color, size = 16 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.height = Math.round(size * dpr)
    const { fn, camera } = ANIMS[animation] ?? ANIMS.mitosis
    // Proportions match the previews: a square spans half the box.
    const spread = size * dpr * 0.25, radius = size * dpr * 0.1
    const start = performance.now()
    let frame = 0

    const draw = (now: number) => {
      const w = canvas.width
      ctx.clearRect(0, 0, w, w)
      ctx.fillStyle = color
      fn((now - start) / 1000)
        .map((p) => {
          const s = camera / (camera + p[2])
          return { x: w / 2 + p[0] * spread * s, y: w / 2 + p[1] * spread * s, r: radius * s * (p[3] ?? 1), z: p[2] }
        })
        .sort((a, b) => b.z - a.z)
        .forEach((d) => {
          if (d.r < 0.2) return
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          ctx.fill()
        })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [animation, color, size])

  return <canvas ref={canvasRef} aria-hidden="true" style={{ width: size, height: size, flexShrink: 0 }} />
}
