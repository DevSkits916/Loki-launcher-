// ==UserScript==
// @name         Social Harvester (Compliant Page Exporter)
// @namespace    https://loki.local/
// @version      0.9.1
// @description  Extracts visible, public metadata from the current page and lets you export JSON. No automation. No scraping behind auth. Compliant and boring on purpose.
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ------- Utilities -------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  const readMeta = (name) =>
    $(`meta[name="${name}"]`)?.content ||
    $(`meta[property="${name}"]`)?.content ||
    "";

  function parseJSONLD() {
    const nodes = $$('script[type="application/ld+json"]');
    const items = [];
    for (const n of nodes) {
      try {
        const obj = JSON.parse(n.textContent || "{}");
        Array.isArray(obj) ? items.push(...obj) : items.push(obj);
      } catch (err) {
        console.warn("Invalid JSON-LD skipped", err);
      }
    }
    return items;
  }

  // Minimal per-domain extractors. Add more as needed.
  const extractors = [
    // Generic OpenGraph/LD fallback (index 0)
    function genericExtractor() {
      const og = {
        title: readMeta("og:title") || document.title,
        description: readMeta("og:description") || readMeta("description"),
        url: readMeta("og:url") || location.href,
        site_name: readMeta("og:site_name") || location.hostname,
        image: readMeta("og:image") || "",
        type: readMeta("og:type") || "",
      };
      const ld = parseJSONLD();
      return {
        source: "generic",
        og,
        ld,
        text_snippet: document.body
          ? (document.body.innerText || "").trim().slice(0, 1000)
          : "",
      };
    },

    // Reddit post style pages (public)
    function redditExtractor() {
      if (!/reddit\.com/i.test(location.hostname)) return null;
      const title =
        $("h1[data-test-id=\"post-content-title\"]")?.innerText?.trim() ||
        $("h1")?.innerText?.trim() ||
        document.title;
      const author =
        $("a[data-testid=\"post_author_link\"]")?.innerText?.trim() || "";
      const votes = $("[id^=\"vote-arrows-\"]")?.ariaLabel || "";
      const content =
        $("[data-test-id=\"post-content\"]")?.innerText?.trim() || "";
      return {
        source: "reddit",
        title,
        author,
        votes,
        content,
        url: location.href,
      };
    },

    // YouTube (public watch pages)
    function youtubeExtractor() {
      if (!/youtube\.com/i.test(location.hostname)) return null;
      const title =
        $("h1.ytd-video-primary-info-renderer")?.innerText?.trim() ||
        $("meta[itemprop=\"name\"]")?.content ||
        document.title;
      const channel =
        $("#text-container.ytd-channel-name #text")?.innerText?.trim() ||
        $("meta[itemprop=\"channelId\"]")?.content ||
        "";
      const desc =
        $("#description-inline-expander")?.innerText?.trim() ||
        $("meta[name=\"description\"]")?.content ||
        "";
      return {
        source: "youtube",
        title,
        channel,
        description: desc,
        url: location.href,
      };
    },

    // Twitter / X public pages
    function twitterExtractor() {
      if (!/(twitter|x)\.com/i.test(location.hostname)) return null;
      const title = readMeta("og:title") || document.title;
      const author = readMeta("twitter:creator") || "";
      const desc =
        readMeta("og:description") || readMeta("description") || "";
      return {
        source: "twitter",
        title,
        author,
        description: desc,
        url: location.href,
      };
    },
  ];

  async function harvestOnce(limitChars = 5000) {
    const loc = {
      href: location.href,
      host: location.host,
      pathname: location.pathname,
    };
    // Try specific extractors (skip generic at index 0)
    for (const ex of extractors.slice(1)) {
      try {
        const data = ex();
        if (data && data.source !== "generic") {
          return normalize(
            {
              ...data,
              harvested_at: nowISO(),
              location: loc,
            },
            limitChars
          );
        }
      } catch (err) {
        console.error("Extractor error", err);
      }
    }
    // Fallback generic
    const generic = extractors[0]();
    return normalize(
      {
        ...generic,
        harvested_at: nowISO(),
        location: loc,
      },
      limitChars
    );
  }

  function normalize(obj, limitChars) {
    const json = JSON.stringify(obj);
    if (json.length > limitChars) {
      obj.note = `Truncated to ~${limitChars} chars for portability`;
      if (obj.text_snippet && obj.text_snippet.length * 2 > limitChars) {
        obj.text_snippet = obj.text_snippet.slice(
          0,
          Math.max(500, Math.floor(limitChars / 4))
        );
      }
    }
    return obj;
  }

  // ------- UI -------
  const PANEL_ID = "sh_panel_loki";
  if (document.getElementById(PANEL_ID)) return;

  GM_addStyle(`
    #${PANEL_ID}{
      position: fixed; z-index: 2147483647;
      right: 12px; bottom: 12px;
      width: 320px; max-width: 90vw;
      background: rgba(20,20,20,.92); color: #fff;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Ubuntu, Arial, sans-serif;
      border: 1px solid #333; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.35);
      backdrop-filter: blur(6px);
    }
    #${PANEL_ID} header {padding: 8px 10px; display:flex; align-items:center; justify-content:space-between; border-bottom: 1px solid #333;}
    #${PANEL_ID} header h1 {margin:0; font-size:13px;}
    #${PANEL_ID} .body {padding:10px; display:grid; gap:8px;}
    #${PANEL_ID} button {
      padding: 6px 10px; border: 1px solid #444; background: #1e1e1e; color:#fff; border-radius: 8px; cursor:pointer;
    }
    #${PANEL_ID} button:hover { background:#242424; }
    #${PANEL_ID} .muted {opacity:.8}
    #${PANEL_ID} textarea {width:100%; height:120px; background:#0e0e0e; color:#ddd; border:1px solid #333; border-radius:8px; padding:8px;}
    #${PANEL_ID} .row {display:flex; gap:8px; align-items:center;}
    #${PANEL_ID} .row input[type="number"] { width: 90px; background:#0e0e0e; color:#ddd; border:1px solid #333; border-radius:6px; padding:6px; }
    #${PANEL_ID} footer {padding:8px 10px; border-top:1px solid #333; display:flex; justify-content:space-between; align-items:center;}
    #${PANEL_ID} a {color:#9ad;}
  `);

  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <header>
      <h1>Social Harvester</h1>
      <div>
        <button id="sh_min">–</button>
        <button id="sh_close">✕</button>
      </div>
    </header>
    <div class="body">
      <div class="row">
        <button id="sh_capture">Capture</button>
        <button id="sh_export">Export JSON</button>
      </div>
      <div class="row">
        <label class="muted">Max JSON size</label>
        <input id="sh_limit" type="number" min="1000" step="500" value="${GM_getValue("limitChars", 5000)}" />
      </div>
      <textarea id="sh_output" placeholder="Captured JSON will appear here..." readonly></textarea>
      <div class="muted">Compliant mode: collects public page metadata only. No automation.</div>
    </div>
    <footer>
      <span class="muted">${location.hostname}</span>
      <a href="#" id="sh_copy">Copy</a>
    </footer>
  `;
  document.documentElement.appendChild(panel);

  const els = {
    capture: $("#sh_capture", panel),
    exportBtn: $("#sh_export", panel),
    out: $("#sh_output", panel),
    copy: $("#sh_copy", panel),
    close: $("#sh_close", panel),
    min: $("#sh_min", panel),
    limit: $("#sh_limit", panel),
    body: panel.querySelector(".body"),
  };

  let lastJSON = null;

  els.capture.addEventListener("click", async () => {
    els.capture.disabled = true;
    try {
      const limit = Number(els.limit.value || 5000);
      GM_setValue("limitChars", limit);
      const data = await harvestOnce(limit);
      lastJSON = JSON.stringify(data, null, 2);
      els.out.value = lastJSON;
    } catch (e) {
      els.out.value = `Error: ${e?.message || e}`;
    } finally {
      els.capture.disabled = false;
    }
  });

  els.exportBtn.addEventListener("click", () => {
    const payload = els.out.value?.trim();
    if (!payload) return alert("Nothing to export. Hit Capture first.");
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const host = location.hostname.replace(/[^\w.-]/g, "_");
    a.href = url;
    a.download = `harvest_${host}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  });

  els.copy.addEventListener("click", (e) => {
    e.preventDefault();
    if (!els.out.value) return;
    navigator.clipboard.writeText(els.out.value).then(
      () => (els.copy.textContent = "Copied!"),
      () => (els.copy.textContent = "Copy failed")
    );
    setTimeout(() => (els.copy.textContent = "Copy"), 1200);
  });

  els.close.addEventListener("click", () => panel.remove());
  let minimized = false;
  els.min.addEventListener("click", () => {
    minimized = !minimized;
    els.body.style.display = minimized ? "none" : "grid";
    panel.querySelector("footer").style.display = minimized ? "none" : "flex";
    els.min.textContent = minimized ? "+" : "–";
  });

  // Optional: quick menu command to re-open panel if closed
  try {
    GM_registerMenuCommand?.("Show Social Harvester", () => {
      if (!document.getElementById(PANEL_ID)) location.reload();
    });
  } catch {}
})();
