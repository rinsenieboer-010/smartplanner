// Apple-achtige scrollbalken voor de hele app.
// De native verticale balk is verborgen (index.css); hier tekenen we per scrollgebied
// een eigen balk: half zo lang als normaal, 8px breed, en beginnend onder een
// eventuele vaste kolomkop ([data-sticky-header]).

const MIN_HEIGHT = 24;
const EDGE = 2;

const thumbs = new Map(); // scroller -> { el, geo }
let scheduled = false;

function isScroller(el) {
  if (el === document.scrollingElement) return el.scrollHeight - window.innerHeight > 1;
  if (el.clientHeight < 40 || el.scrollHeight - el.clientHeight <= 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === "auto" || oy === "scroll";
}

function isDark(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    if (a === 0) continue;
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }
  return false;
}

function createThumb(scroller) {
  const el = document.createElement("div");
  el.className = "jmp-thumb";
  el.setAttribute("aria-hidden", "true");
  let drag = null;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    drag = { y: e.clientY, top: scroller.scrollTop };
  });
  el.addEventListener("pointermove", (e) => {
    const t = thumbs.get(scroller);
    if (!drag || !t?.geo) return;
    const { max, track, height } = t.geo;
    scroller.scrollTop = drag.top + (e.clientY - drag.y) * (max / Math.max(1, track - height));
  });
  const end = () => { drag = null; el.classList.remove("dragging"); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  document.body.appendChild(el);
  return { el, geo: null };
}

function place(scroller, t) {
  const isPage = scroller === document.scrollingElement;
  const rect = isPage ? { top: 0, left: 0, width: window.innerWidth } : scroller.getBoundingClientRect();
  const header = isPage ? null : [...scroller.querySelectorAll("[data-sticky-header]")].find((h) => {
    for (let n = h.parentElement; n && n !== scroller; n = n.parentElement) if (thumbs.has(n)) return false;
    return true;
  });
  // Balk begint op de bovenrand van het eerste taakvakje onder de kolomkop
  const firstRow = header?.nextElementSibling;
  const top = !header ? 0 : firstRow
    ? firstRow.getBoundingClientRect().top - rect.top + scroller.scrollTop
    : header.offsetHeight;
  const hBar = scroller.offsetHeight - scroller.clientHeight;
  const viewH = isPage ? window.innerHeight : scroller.clientHeight;
  const track = viewH - top - EDGE;
  const max = scroller.scrollHeight - viewH;
  if (track < MIN_HEIGHT || max <= 1 || rect.width === 0) {
    t.el.style.display = "none";
    return;
  }
  const height = Math.max(MIN_HEIGHT, (track * viewH) / scroller.scrollHeight / 2);
  const y = rect.top + top + (track - height) * (scroller.scrollTop / max);
  const x = rect.left + (isPage ? window.innerWidth : scroller.clientWidth) - 10 - EDGE;

  // Niet tonen als het scrollgebied op die plek bedekt is (bijv. door een modal)
  const probe = document.elementFromPoint(x - 4, y + height / 2);
  const covered = !isPage && probe && probe !== t.el && !scroller.contains(probe);
  t.el.style.display = covered ? "none" : "block";
  t.el.style.top = `${y}px`;
  t.el.style.left = `${x}px`;
  t.el.style.height = `${height}px`;
  t.el.classList.toggle("on-dark", isDark(probe && probe !== t.el ? probe : scroller));
  t.geo = { max, track, height, hBar };
}

let lastScan = 0;
let scanTimer = null;

function scan() {
  lastScan = performance.now();
  const found = new Set();
  if (isScroller(document.scrollingElement)) found.add(document.scrollingElement);
  for (const el of document.body.querySelectorAll("*")) {
    if (!el.classList.contains("jmp-thumb") && isScroller(el)) found.add(el);
  }
  for (const [scroller, t] of thumbs) {
    if (!found.has(scroller) || !scroller.isConnected) {
      t.el.remove();
      thumbs.delete(scroller);
    }
  }
  for (const scroller of found) {
    if (!thumbs.has(scroller)) thumbs.set(scroller, createThumb(scroller));
  }
}

function refresh() {
  scheduled = false;
  for (const [scroller, t] of thumbs) place(scroller, t);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(refresh);
}

// DOM-wijzigingen: hooguit ~6x per seconde opnieuw zoeken naar scrollgebieden
function scheduleScan() {
  if (scanTimer) return;
  const wait = Math.max(0, 150 - (performance.now() - lastScan));
  scanTimer = setTimeout(() => { scanTimer = null; scan(); schedule(); }, wait);
}

export function initScrollThumbs() {
  if (typeof window === "undefined" || !CSS.supports("selector(::-webkit-scrollbar)")) return;
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", () => { schedule(); scheduleScan(); });
  new MutationObserver((records) => {
    if (records.every((r) => r.target.classList?.contains("jmp-thumb"))) return;
    schedule();
    scheduleScan();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  scheduleScan();
}
