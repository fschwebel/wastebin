function $(id) {
  return document.getElementById(id);
}

document.addEventListener('keydown', onKey);
const copyButton = $("copy-button");
copyButton.addEventListener("click", copy);
const TOAST_CONTENT = copyButton.dataset.toastContent;
const TOAST_URL = copyButton.dataset.toastUrl;

function highlightLines(scroll) {
  document.querySelectorAll('.line-highlight').forEach(el => {
    el.classList.remove('line-highlight');
  });

  const match = window.location.hash.match(/^#L(\d+)(?:-L(\d+))?$/);
  if (!match) return;

  const a = parseInt(match[1], 10);
  const b = match[2] ? parseInt(match[2], 10) : a;
  const from = Math.min(a, b);
  const to = Math.max(a, b);

  for (let i = from; i <= to; i++) {
    const lnDiv = document.getElementById('L' + i);
    if (lnDiv) lnDiv.classList.add('line-highlight');
    const lcDiv = document.getElementById('LC' + i);
    if (lcDiv) lcDiv.classList.add('line-highlight');
  }

  if (scroll && match[2]) {
    const firstLn = document.getElementById('L' + from);
    if (firstLn) firstLn.scrollIntoView({ block: 'center' });
  }
}

window.addEventListener('hashchange', () => highlightLines(true));
highlightLines(true);

document.querySelectorAll('#line-numbers a').forEach(a => {
  a.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    const m = a.getAttribute('href').match(/^#L(\d+)$/);
    const current = window.location.hash.match(/^#L(\d+)(?:-L\d+)?$/);
    if (!m || !current) return;
    e.preventDefault();
    const clicked = parseInt(m[1], 10);
    const base = parseInt(current[1], 10);
    const from = Math.min(base, clicked);
    const to = Math.max(base, clicked);
    history.replaceState(null, '', from === to ? '#L' + from : '#L' + from + '-L' + to);
    highlightLines(false);
  });
});

function showToast(text, timeout) {
  let toast = $("toast");

  toast.innerText = text;
  toast.classList.toggle("hidden");
  toast.classList.toggle("shown");

  setTimeout(() => {
    toast.classList.toggle("hidden");
    toast.classList.toggle("shown");
  }, timeout);
}

function copy() {
  const code = document.querySelector('.src-code code');
  if (!code) return;
  // Every row is a block element holding one line without its terminator.
  // `textContent` drops the breaks between block elements along with it, so
  // join the rows by hand.
  const content = Array.from(code.querySelectorAll('[id^="LC"]'), row => row.textContent)
    .join('\n')
    .trim();

  navigator.clipboard.writeText(content)
    .then(() => {
      showToast(TOAST_CONTENT, 1500);
    }, function(err) {
      console.error("failed to copy content", err);
    });
}

function onKey(e) {
  if (e.keyCode == 27) {
    const overlay = document.getElementById("overlay");
    if (overlay && overlay.style.display == "block") {
      overlay.style.display = "none";
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    return;
  }

  const pasteId = document.body.dataset.pasteId;

  if (e.key == 'n') {
    window.location.href = "/";
  }
  else if (e.key == 'r' && pasteId) {
    window.location.href = "/raw/" + pasteId;
  }
  else if (e.key == 'y') {
    navigator.clipboard.writeText(window.location.href);
    showToast(TOAST_URL, 1500);
  }
  else if (e.key == 'd' && pasteId) {
    window.location.href = "/dl/" + pasteId;
  }
  else if (e.key == 'q' && pasteId) {
    window.location.href = "/qr/" + pasteId;
  }
  else if (e.key == 'p') {
    window.location.href = window.location.href.split("?")[0];
  }
  else if (e.key == 'c') {
    copy();
  }
  else if (e.key == 'w') {
    document.body.classList.toggle('line-wrap');
    syncLineNumbers();
  }
  else if (e.key == 'm') {
    const toggle = document.getElementById('view-toggle');
    if (toggle) window.location.href = toggle.href;
  }
  else if (e.key == '?') {
    toggleOverlay();
  }
}

// Must produce the same rough approximation as `Lang::duration` on the
// server, so ticking over from the server-rendered value is seamless: the
// same units, at most two parts, and the translated `{0}` templates the page
// passes in as `data-{unit}-one` and `data-{unit}-many` attributes.
function formatExpiration(secs, templates) {
  const units = [
    [365 * 24 * 60 * 60, "year"],
    [30 * 24 * 60 * 60, "month"],
    [7 * 24 * 60 * 60, "week"],
    [24 * 60 * 60, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
    [1, "second"],
  ];

  const parts = [];

  for (const [magnitude, unit] of units) {
    const count = Math.floor(secs / magnitude);
    if (count > 0) {
      const template = templates[unit + (count === 1 ? "One" : "Many")];
      parts.push(template.replace("{0}", count));
      secs %= magnitude;
    }
  }

  return parts.slice(0, 2).join(", ");
}

const countdown = $("expiration-countdown");
if (countdown) {
  const expiresAt = Date.now() + countdown.dataset.seconds * 1000;

  const timer = setInterval(() => {
    const secs = Math.round((expiresAt - Date.now()) / 1000);
    if (secs > 0) {
      countdown.textContent = formatExpiration(secs, countdown.dataset);
    } else {
      const expiration = $("expiration");
      expiration.textContent = expiration.dataset.expired;
      clearInterval(timer);
    }
  }, 1000);
}

function toggleOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.style.display = overlay.style.display != 'block' ? 'block' : 'none';
  if (!overlay.dataset.bound) {
    overlay.addEventListener('click', () => { overlay.style.display = 'none'; });
    overlay.dataset.bound = '1';
  }
}

const codeContainer = document.querySelector('.src-code');
const codeRows = codeContainer ? codeContainer.querySelectorAll('code > div[id^="LC"]') : [];
const numberRows = document.querySelectorAll('#line-numbers > div[id^="L"]');

// `w` soft-wraps the source view, which makes a line span several visual rows.
// Grow each number's cell along with the line it labels so the gutter keeps up.
function syncLineNumbers() {
  if (!codeContainer || !codeRows.length) return;

  const lineHeight = parseFloat(getComputedStyle(codeContainer).lineHeight);
  if (!lineHeight) return;

  for (let i = 0; i < codeRows.length && i < numberRows.length; i++) {
    numberRows[i].style.setProperty('--rows', codeRows[i].getBoundingClientRect().height / lineHeight);
  }
}

syncLineNumbers();

// Wrapping changes with the available width and with the font metrics.
if (window.ResizeObserver && codeContainer) {
  new ResizeObserver(syncLineNumbers).observe(codeContainer);
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(syncLineNumbers);
}
