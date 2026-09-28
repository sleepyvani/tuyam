#!/usr/bin/env bun
// Offline renderer. Drives the app in headless Chrome (?export=1) and either
//   stills:  bun scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//            --jobs N renders N segments in parallel Chromes and joins them; --nvenc encodes on an NVIDIA GPU;
//            --text-once draws the 2D (text) layers once per frame instead of per sub-frame (faster, text unblurred)
//   thumbnail: bun scripts/render.ts stills --thumb --t 5 --out ../out/thumb   (the YouTube thumbnail plate)
//   (--chrome <path> or $CHROME_PATH picks the browser; default: Chrome on macOS, playwright's Chromium elsewhere)
//   perf:    bun scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1] [--shutter 0.5]   (avg ms per frame incl. GPU sync and the export's pixel readback)
//   video:   bun scripts/render.ts video [--from 0] [--to 242.04] [--fps 60] [--crf 16] [--x264 aq-mode=3] [--samples 1] [--shutter 0.5] [--out ../out/tuyam.mp4] [--noaudio]
//            --samples N averages N sub-frames per frame over shutter×(1/fps): motion blur + temporal AA;
//            --samples auto picks the count per frame (4, 12, 36, 108 or 324, see Engine.render)
//   --scale N (all modes): render at N× the 1920x1080 layout (--scale 2 = true 3840x2160); stills are then saved
//            full-res from the pixel buffer, videos are encoded at the physical size.
// Uses the Vite dev server at --url (default http://localhost:5173); starts a private one if unreachable.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
const OW = 1920 * SCALE, OH = 1080 * SCALE; // output size
// --samples N (fixed) or --samples auto [--min-samples 4] [--max-samples 324] [--tol 3] (adaptive, see Engine.render)
const SAMPLES = opt('samples', '1') === 'auto'
  ? { min: +opt('min-samples', '4')!, max: +opt('max-samples', '324')!, tol: +opt('tol', '3')! }
  : +opt('samples', '1')!;
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
const ROOT = path.resolve(APP, '..');

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const url = opt('url', 'http://localhost:5173')!;
  if (await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  // no live reload: a file saved mid-render must not reload the page
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, MV_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop: () => proc.kill() };
}

function findChromium(): string | undefined {
  if (process.platform === 'darwin') return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const p of [path.join(root, 'chromium'), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try {
      const st = statSync(p);
      if (st.isFile()) return p;
      if (st.isDirectory()) {
        const sub = readdirSync(p).find((d) => existsSync(path.join(p, d, 'chrome')));
        if (sub) return path.join(p, sub, 'chrome');
        if (existsSync(path.join(p, 'chrome'))) return path.join(p, 'chrome');
      }
    } catch {}
  }
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith('chromium-')) : [];
  for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) if (existsSync(path.join(root, d, sub))) return path.join(root, d, sub);
  return undefined;
}

async function openPage(url: string) {
  // macOS: the installed Chrome on Metal. Elsewhere: --chrome <path>, $CHROME_PATH, or playwright's
  // own Chromium (PLAYWRIGHT_BROWSERS_PATH), on the machine's GPU, or on SwiftShader (software GL) on
  // a server without one: much slower, same frames. --angle <backend> forces an ANGLE backend.
  const exe = opt('chrome') ?? process.env.CHROME_PATH ?? findChromium();
  const mac = process.platform === 'darwin';
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
    headless: !flag('headed'),
    args: [`--use-angle=${opt('angle', mac ? 'metal' : 'default')}`, ...(mac ? [] : ['--enable-unsafe-swiftshader']), '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}${flag('text-once') ? '&textonce=1' : ''}${flag('thumb') ? '&thumb=1' : ''}`);
  await page.waitForFunction(() => (window as any).__mv?.ready || (window as any).__mv?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__mv.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const size: [number, number] = await page.evaluate(() => [(window as any).__mv.width ?? 1920, (window as any).__mv.height ?? 1080]);
  if (size[0] !== OW || size[1] !== OH) throw new Error(`app renders ${size[0]}x${size[1]}, expected ${OW}x${OH} (--scale ${SCALE})`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__mv.errors);
  if (sceneErrors.length) console.error('SCENE ERRORS:\n' + sceneErrors.join('\n'));
  return { browser, page, logs };
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const k: number = await page.evaluate(([t, s, sh]) => (window as any).__mv.still(t, s, sh), [t, SAMPLES, +opt('shutter', '0.5')!] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    if (typeof SAMPLES !== 'number') console.log(`t=${t}: ${k} sub-frames`);
    // at scale > 1 the canvas is shown downscaled on the page: save the full-res pixel buffer instead
    if (SCALE !== 1) await Bun.write(f, Buffer.from(await page.evaluate(() => (window as any).__mv.png()), 'base64'));
    else await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols }) => {
    const P = (window as any).__mv;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

/** Video encoder args: x264 (default) or NVIDIA NVENC (--nvenc: the GPU encodes, the CPU stays free for Chrome). */
function encoderArgs(crf: string) {
  if (flag('nvenc')) return ['-c:v', 'h264_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-cq', crf, '-b:v', '0', '-pix_fmt', 'yuv420p'];
  return ['-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', opt('x264', 'aq-mode=3')!];
}

/**
 * Render [from, to) of the page into `out`. `audio` muxes the song's matching slice; `progress` receives
 * the frame count (for the combined readout of parallel jobs), otherwise progress prints here.
 */
async function video(page: Page, from: number, to: number, fps: number, out: string, o: { audio?: boolean; progress?: (n: number) => void } = {}) {
  mkdirSync(path.dirname(out), { recursive: true });
  const withAudio = o.audio ?? !flag('noaudio');
  const crf = opt('crf', '16')!;
  const audio = path.join(ROOT, 'audio/tuyam.mp3');
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0'];
  if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  // Frames are sRGB (toSRGB in the final pass): convert with the BT.709 matrix and tag the stream,
  // otherwise ffmpeg converts with BT.601 while players and YouTube decode untagged HD as BT.709.
  // scale tags the matrix and range; primaries and transfer need setparams (the -color_* output flags don't reach the stream).
  args.push('-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709', ...encoderArgs(crf));
  if (withAudio) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: Math.max(64 * 1024 * 1024, OW * OH * 4 + 1024),
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames)); // ack: the page keeps at most a few frames ahead of ffmpeg (bounded memory at 4K)
        if (o.progress) o.progress(frames);
        else if (frames % 60 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      },
    },
  });
  const used: Record<string, number> = await page.evaluate((o) => (window as any).__mv.stream(o), { from, to, fps, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: +opt('shutter', '0.5')!, inflight: 4 });
  // wait for all frames to arrive
  while (frames < total) await Bun.sleep(20);
  ff.stdin.end();
  await ff.exited;
  server.stop();
  if (!o.progress) {
    console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
  }
  return used;
}

/**
 * --jobs N: split [from, to) into N contiguous runs of whole frames, render each in its own headless
 * Chrome (its own renderer process, so the CPU-side work — Canvas2D text, uploads, readback — runs on N
 * cores at once while they share the GPU), encode each to a part file, then concatenate losslessly and
 * mux the song. Frames are pure functions of t, so the joins are seamless.
 */
async function videoParallel(url: string, from: number, to: number, fps: number, out: string, jobs: number) {
  const n0 = Math.round(from * fps), n1 = Math.round(to * fps), total = n1 - n0;
  const dir = path.join(path.dirname(out), `.parts-${path.basename(out, path.extname(out))}`);
  mkdirSync(dir, { recursive: true });
  const counts = new Array(jobs).fill(0);
  const t0 = performance.now();
  const tick = () => {
    const done = counts.reduce((a, b) => a + b, 0), el = (performance.now() - t0) / 1000;
    process.stdout.write(`\r${done}/${total} frames  ${(done / el).toFixed(1)} fps  eta ${((total - done) / Math.max(1e-3, done / el)).toFixed(0)}s  [${counts.join(' ')}]   `);
  };
  const timer = setInterval(tick, 1000);
  const parts = Array.from({ length: jobs }, (_, j) => path.join(dir, `part${String(j).padStart(2, '0')}.mp4`));
  const used: Record<string, number> = {};
  await Promise.all(parts.map(async (part, j) => {
    const a = n0 + Math.round((total * j) / jobs), b = n0 + Math.round((total * (j + 1)) / jobs);
    const { browser, page } = await openPage(url);
    try {
      const u = await video(page, a / fps, b / fps, fps, part, { audio: false, progress: (n) => (counts[j] = n) });
      for (const [k, v] of Object.entries(u)) used[k] = (used[k] ?? 0) + v;
    } finally { await browser.close(); }
  }));
  clearInterval(timer);
  tick();
  const list = path.join(dir, 'list.txt');
  await Bun.write(list, parts.map((p) => `file '${path.basename(p)}'`).join('\n') + '\n');
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (!flag('noaudio')) args.push('-ss', String(from), '-t', String(to - from), '-i', path.join(ROOT, 'audio/tuyam.mp3'), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-c:v', 'copy', '-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' });
  await ff.exited;
  if (ff.exitCode === 0) rmSync(dir, { recursive: true, force: true });
  console.log(`\nwrote ${out} (${total} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s, ${jobs} jobs)`);
  console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs } = await openPage(url);
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const files = await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!);
    console.log(files.join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      // 4 frames around every timeline boundary: 2 frames before, 2 after
      const tl: { id: string; start: number }[] = await page.evaluate(() => (window as any).__mv.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples, shutter }) => {
      const P = (window as any).__mv;
      const ms: number[] = [];
      const buf = new Uint8Array(P.width * P.height * 4);
      P.still(from);
      const used: Record<number, number> = {};
      P.engine.prof = {};
      let rb = 0;
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        const k = P.engine.render(t, 1 / 60, false, samples, shutter);
        used[k] = (used[k] ?? 0) + 1;
        const r0 = performance.now();
        await P.engine.readPixelsAsync(buf);
        rb += performance.now() - r0;
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      const prof: Record<string, number> = { ...P.engine.prof, '(readback)': rb };
      for (const k in prof) prof[k] = prof[k] / ms.length;
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], used, prof };
    }, { from, to, samples: SAMPLES, shutter: +opt('shutter', '0.5')! });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  sub-frames ${hist(r.used)}`);
    // CPU-side ms per frame (JS time; GPU work is asynchronous and shows up in the total and in readback)
    console.log('  cpu ms/frame: ' + Object.entries(r.prof as Record<string, number>).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  '));
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__mv.duration);
    const from = +opt('from', '0')!, to = +opt('to', String(dur))!, fps = +opt('fps', '60')!;
    const out = path.resolve(opt('out', path.join(ROOT, 'out/tuyam.mp4'))!);
    const jobs = Math.max(1, Math.round(+opt('jobs', '1')!));
    if (jobs > 1) await videoParallel(url, from, to, fps, out, jobs);
    else await video(page, from, to, fps, out);
  }
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
