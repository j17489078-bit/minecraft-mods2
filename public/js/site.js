/* Minecraft Mods - shared site behavior. Mod data lives on the server;
   this file only renders it and talks to /api/* for admin actions. */
(function () {
  "use strict";

  var MODS = [];
  var modsPageRefresh = null; // set by setupModsPage once the page's DOM exists

  var PAGES = [
    { label: "Home", url: "index.html", sub: "page" },
    { label: "Mods", url: "mods.html", sub: "page" },
    { label: "Updates", url: "updates.html", sub: "page" },
    { label: "About", url: "about.html", sub: "page" },
    { label: "Contact", url: "contact.html", sub: "page" }
  ];

  /* ── Helpers ──────────────────────────────────────── */

  function fmtNum(n) {
    return (parseInt(n, 10) || 0).toLocaleString("en-US");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slugify(name) {
    return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function card(t) {
    var id = t.id || slugify(t.name);
    var loaders = Array.isArray(t.loaders) ? t.loaders : [];
    var mc = Array.isArray(t.mc) ? t.mc : [];
    var tags = Array.isArray(t.tags) ? t.tags : [];
    return (
      '<article class="mod-card" id="mod-' + esc(id) + '" data-slug="' + esc(id) + '">' +
      '<div class="mod-card-top">' +
      "<h3>" + esc(t.name) + "</h3>" +
      (t.version ? '<span class="version-pill">v' + esc(t.version) + "</span>" : "") +
      "</div>" +
      (t.cat ? '<p class="mod-cat">' + esc(t.cat) + "</p>" : "") +
      '<p class="mod-desc">' + esc(t.desc || "No description yet.") + "</p>" +
      (tags.length
        ? '<div class="mod-tags">' + tags.map(function (tag) { return '<span class="mod-tag">' + esc(tag) + "</span>"; }).join("") + "</div>"
        : "") +
      '<div class="mod-meta">' +
      "<span>" + esc(loaders.join(" · ")) + (mc.length ? " · MC " + esc(mc.join("–")) : "") + "</span>" +
      "<span>" + fmtNum(t.downloads) + " dl</span>" +
      "</div>" +
      '<div class="mod-actions">' +
      '<a class="bf-btn-download" href="downloads/' + encodeURIComponent(t.file || "") + '" data-mod-id="' + esc(id) + '" download>Download .jar</a>' +
      '<button type="button" class="bf-btn-copylink" data-copy-slug="' + esc(id) + '">Copy link</button>' +
      "</div>" +
      "</article>"
    );
  }

  /* ── Global mod actions (works on any page with mod cards) ── */

  function setupGlobalModActions() {
    document.body.addEventListener("click", function (e) {
      var dl = e.target.closest("[data-mod-id].bf-btn-download");
      if (dl) {
        fetch("/api/mods/" + encodeURIComponent(dl.dataset.modId) + "/download", { method: "POST" }).catch(function () {});
        return; // let the download proceed normally
      }
      var copyBtn = e.target.closest("[data-copy-slug]");
      if (copyBtn) {
        var url = window.location.origin + "/mods.html?mod=" + encodeURIComponent(copyBtn.dataset.copySlug);
        var original = copyBtn.textContent;
        var flash = function (text) {
          copyBtn.textContent = text;
          setTimeout(function () { copyBtn.textContent = original; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { flash("Copied!"); }).catch(function () { window.prompt("Copy this link:", url); });
        } else {
          window.prompt("Copy this link:", url);
        }
      }
    });
  }

  /* ── Reveal on scroll ─────────────────────────────── */

  function setupReveal() {
    var els = document.querySelectorAll("[data-rv]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.transitionDelay = (parseInt(el.getAttribute("data-rv-delay") || "0", 10)) + "ms";
        el.classList.add("in");
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Count up ─────────────────────────────────────── */

  function setupCounts() {
    var els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.dataset.count, 10) || 0;
        var t0 = null;
        function frame(t) {
          if (!t0) t0 = t;
          var p = Math.min((t - t0) / 900, 1);
          el.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Progress bar / nav / back to top ────────────── */

  function setupProgress() {
    var bar = document.getElementById("progress");
    if (!bar) return;
    function update() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = ((max > 0 ? h.scrollTop / max : 0) * 100).toFixed(2) + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }
  function setupNav() {
    var btn = document.getElementById("nav-btn");
    var menu = document.getElementById("mobile-menu");
    if (btn && menu) btn.addEventListener("click", function () { menu.classList.toggle("open"); });
  }
  function setupTop() {
    var btn = document.querySelector("[data-top]");
    if (btn) btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }
  function setupFaq() {
    document.querySelectorAll("[data-faq]").forEach(function (item) {
      var btn = item.querySelector("[data-faq-btn]");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ── Command palette ──────────────────────────────── */

  function setupCmdk() {
    var panel = document.getElementById("cmdk");
    if (!panel) return;
    var input = document.getElementById("cmdk-input");
    var list = document.getElementById("cmdk-list");
    var sel = -1;
    var items = [];

    function close() { panel.hidden = true; input.value = ""; sel = -1; }
    function open() { panel.hidden = false; render(""); requestAnimationFrame(function () { input.focus(); }); }
    function render(q) {
      q = (q || "").trim().toLowerCase();
      var pages = PAGES.filter(function (p) { return !q || p.label.toLowerCase().indexOf(q) > -1; });
      var mods = MODS.filter(function (m) { return !q || m.name.toLowerCase().indexOf(q) > -1 || (m.cat || "").toLowerCase().indexOf(q) > -1; });
      items = [];
      var html = "";
      if (pages.length) {
        html += '<p class="cmdk-group">Pages</p>';
        pages.forEach(function (p) {
          items.push({ url: p.url, label: p.label, sub: p.sub });
          html += '<button type="button" class="cmdk-item" data-i="' + (items.length - 1) + '"><span>' + esc(p.label) + '</span><span class="cmdk-sublabel">' + esc(p.sub) + "</span></button>";
        });
      }
      if (mods.length) {
        html += '<p class="cmdk-group">Mods</p>';
        mods.forEach(function (m) {
          items.push({ url: "mods.html?mod=" + encodeURIComponent(m.id || slugify(m.name)), label: m.name, sub: m.version ? "v" + m.version : "mod" });
          html += '<button type="button" class="cmdk-item" data-i="' + (items.length - 1) + '"><span>' + esc(m.name) + '</span><span class="cmdk-sublabel">' + esc(items[items.length - 1].sub) + "</span></button>";
        });
      }
      list.innerHTML = html || '<p style="padding:0.75rem;font-size:0.875rem;color:var(--muted);">No matches.</p>';
      sel = -1;
      highlight();
      list.querySelectorAll(".cmdk-item").forEach(function (el) { el.addEventListener("click", function () { go(parseInt(el.dataset.i, 10)); }); });
    }
    function highlight() {
      var els = list.querySelectorAll(".cmdk-item");
      els.forEach(function (el, i) { el.classList.toggle("sel", i === sel); });
      var cur = list.querySelector(".cmdk-item.sel");
      if (cur) cur.scrollIntoView({ block: "nearest" });
    }
    function go(i) {
      if (i < 0 || !items[i]) return;
      window.location.href = items[i].url;
    }

    document.querySelectorAll("[data-cmdk-open]").forEach(function (b) { b.addEventListener("click", open); });
    document.querySelectorAll("[data-cmdk-close]").forEach(function (b) { b.addEventListener("click", close); });
    panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); highlight(); }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); highlight(); }
      if (e.key === "Enter") { e.preventDefault(); go(sel); }
    });
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); panel.hidden ? open() : close(); }
    });
  }

  /* ── Featured grid (index) ────────────────────────── */

  function renderFeatured() {
    var grid = document.getElementById("featured-grid");
    if (!grid) return;
    var featured = MODS.filter(function (m) { return m.featured; });
    grid.innerHTML = (featured.length ? featured : MODS.slice(0, 3)).map(card).join("") ||
      '<p style="color:var(--muted);">No mods published yet.</p>';
  }

  /* ── Mods page: search / filter / sort / paging / deep links ── */

  function setupModsPage() {
    var grid = document.getElementById("mod-grid");
    if (!grid) return;
    var input = document.getElementById("mod-search");
    var pillsEl = document.getElementById("cat-pills");
    var loaderPillsEl = document.getElementById("loader-pills");
    var sortEl = document.getElementById("mod-sort");
    var countEl = document.getElementById("mod-count");
    var clearBtn = document.getElementById("mod-clear");
    var loadMoreBtn = document.getElementById("mod-load-more");
    var PAGE_SIZE = 6;

    var params = new URLSearchParams(window.location.search);
    var state = {
      cat: params.get("cat") || "All",
      q: params.get("q") || "",
      sort: params.get("sort") || "newest",
      loaders: params.get("loaders") ? params.get("loaders").split(",").filter(Boolean) : [],
      visible: PAGE_SIZE
    };
    if (input) input.value = state.q;
    if (sortEl) sortEl.value = state.sort;

    function syncUrl() {
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.cat && state.cat !== "All") p.set("cat", state.cat);
      if (state.sort && state.sort !== "newest") p.set("sort", state.sort);
      if (state.loaders.length) p.set("loaders", state.loaders.join(","));
      var qs = p.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
    function hasActiveFilters() {
      return !!(state.q || state.sort !== "newest" || (state.cat && state.cat !== "All") || state.loaders.length);
    }

    function buildPills() {
      var cats = ["All"];
      MODS.forEach(function (m) { if (m.cat && cats.indexOf(m.cat) === -1) cats.push(m.cat); });
      if (cats.indexOf(state.cat) === -1) state.cat = "All";

      if (pillsEl) {
        pillsEl.innerHTML = cats.map(function (c) {
          return '<button type="button" class="bf-pill' + (c === state.cat ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
        }).join("");
      }

      var loaders = [];
      MODS.forEach(function (m) { (m.loaders || []).forEach(function (l) { if (loaders.indexOf(l) === -1) loaders.push(l); }); });
      state.loaders = state.loaders.filter(function (l) { return loaders.indexOf(l) !== -1; });
      if (loaderPillsEl) {
        loaderPillsEl.innerHTML = loaders.map(function (l) {
          var active = state.loaders.indexOf(l) !== -1;
          return '<button type="button" class="bf-pill' + (active ? " active" : "") + '" data-loader="' + esc(l) + '" aria-pressed="' + active + '">' + esc(l) + "</button>";
        }).join("");
        loaderPillsEl.hidden = !loaders.length;
      }
    }

    function filtered() {
      var list = MODS.filter(function (m) {
        if (state.cat !== "All" && m.cat !== state.cat) return false;
        if (state.loaders.length && !state.loaders.some(function (l) { return (m.loaders || []).indexOf(l) !== -1; })) return false;
        if (state.q) {
          var hay = [m.name, m.cat, m.desc].concat(m.tags || []).join(" ").toLowerCase();
          if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
        }
        return true;
      });
      var sorts = {
        newest: function (a, b) { return (b.added || "").localeCompare(a.added || ""); },
        oldest: function (a, b) { return (a.added || "").localeCompare(b.added || ""); },
        az: function (a, b) { return a.name.localeCompare(b.name); },
        downloads: function (a, b) { return (b.downloads || 0) - (a.downloads || 0); }
      };
      return list.sort(sorts[state.sort] || sorts.newest);
    }

    function render() {
      syncUrl();
      buildPills();
      var full = filtered();
      var list = full.slice(0, state.visible);
      grid.innerHTML = list.map(card).join("") || '<p style="padding:1rem 0.25rem;color:var(--muted);font-size:0.9rem;">No mods match that search.</p>';
      if (countEl) {
        var totalDl = full.reduce(function (s, m) { return s + (m.downloads || 0); }, 0);
        countEl.textContent = full.length + (full.length === 1 ? " mod" : " mods") + "  ·  " + fmtNum(totalDl) + " dl";
      }
      if (clearBtn) clearBtn.hidden = !hasActiveFilters();
      if (loadMoreBtn) loadMoreBtn.hidden = full.length <= state.visible;
    }

    if (pillsEl) {
      pillsEl.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-cat]");
        if (!btn) return;
        state.cat = btn.dataset.cat; state.visible = PAGE_SIZE; render();
      });
    }
    if (loaderPillsEl) {
      loaderPillsEl.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-loader]");
        if (!btn) return;
        var l = btn.dataset.loader, idx = state.loaders.indexOf(l);
        if (idx === -1) state.loaders.push(l); else state.loaders.splice(idx, 1);
        state.visible = PAGE_SIZE; render();
      });
    }
    if (input) input.addEventListener("input", function () { state.q = input.value; state.visible = PAGE_SIZE; render(); });
    if (sortEl) sortEl.addEventListener("change", function () { state.sort = sortEl.value; render(); });
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.cat = "All"; state.q = ""; state.sort = "newest"; state.loaders = []; state.visible = PAGE_SIZE;
        if (input) input.value = "";
        if (sortEl) sortEl.value = "newest";
        render();
      });
    }
    if (loadMoreBtn) loadMoreBtn.addEventListener("click", function () { state.visible += PAGE_SIZE; render(); });

    render();
    modsPageRefresh = render;

    var focusMod = params.get("mod");
    if (focusMod) {
      requestAnimationFrame(function () {
        var el = document.getElementById("mod-" + focusMod);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("mod-highlight");
        setTimeout(function () { el.classList.remove("mod-highlight"); }, 2200);
      });
    }
  }

  /* ── Updates timeline (derived from mod data) ─────── */

  function renderUpdates() {
    var list = document.getElementById("updates-list");
    if (!list) return;
    var items = MODS.slice()
      .sort(function (a, b) { return (b.added || "").localeCompare(a.added || ""); })
      .map(function (m) {
        return {
          time: m.added || "",
          title: m.name + (m.version ? " v" + m.version : "") + " is up",
          body: m.desc || "",
          badge: [(m.loaders || []).join(" · "), (m.mc || []).length ? "MC " + m.mc.join("–") : ""].filter(Boolean).join(" · ")
        };
      });
    items.push({ time: "2026", title: "Minecraft Mods starts", body: "First hub goes live: no bloat, no dark patterns, no noise. Just the thing, working well.", badge: "est. 2026" });
    list.innerHTML = items.map(function (u) {
      return '<li class="timeline-item">' +
        '<p class="timeline-time">' + esc(u.time) + "</p>" +
        '<p class="timeline-title">' + esc(u.title) + "</p>" +
        '<p class="timeline-body">' + esc(u.body) + "</p>" +
        (u.badge ? '<span class="timeline-badge">' + esc(u.badge) + "</span>" : "") +
        "</li>";
    }).join("");
  }

  /* ── Data loading ─────────────────────────────────── */

  function loadMods() {
    return fetch("/api/mods")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        MODS = Array.isArray(data) ? data : [];
      })
      .catch(function () { MODS = []; })
      .then(function () {
        renderFeatured();
        if (modsPageRefresh) modsPageRefresh(); else setupModsPage();
        renderUpdates();
      });
  }

  /* ── Admin panel (login, add mod, manage list) ────── */

  function setupAdmin() {
    var panel = document.getElementById("admin-panel");
    if (!panel) return;

    var signedOut = document.getElementById("admin-signed-out");
    var signedIn = document.getElementById("admin-signed-in");
    var loginForm = document.getElementById("admin-login-form");
    var loginErr = document.getElementById("admin-login-error");
    var logoutBtn = document.getElementById("admin-logout-btn");
    var addForm = document.getElementById("admin-add-form");
    var addErr = document.getElementById("admin-add-error");
    var addOk = document.getElementById("admin-add-success");
    var manageList = document.getElementById("admin-manage-list");

    function setAuthedUI(authed) {
      if (signedOut) signedOut.hidden = authed;
      if (signedIn) signedIn.hidden = !authed;
      if (authed) renderManageList();
    }
    function renderManageList() {
      if (!manageList) return;
      manageList.innerHTML = MODS.map(function (m) {
        return '<li class="admin-mod-row">' +
          "<span>" + esc(m.name) + (m.cat ? ' <span class="mod-cat">' + esc(m.cat) + "</span>" : "") + "</span>" +
          '<button type="button" class="bf-btn-copylink" data-delete-id="' + esc(m.id) + '">Remove</button>' +
          "</li>";
      }).join("") || '<li style="color:var(--muted);">No mods yet.</li>';
    }

    fetch("/api/session").then(function (r) { return r.json(); }).then(function (d) { setAuthedUI(!!d.authed); }).catch(function () { setAuthedUI(false); });

    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        loginErr.textContent = "";
        var pw = document.getElementById("admin-password").value;
        fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) })
          .then(function (r) { if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Could not sign in."); }); return r.json(); })
          .then(function () { loginForm.reset(); setAuthedUI(true); })
          .catch(function (err) { loginErr.textContent = err.message; });
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        fetch("/api/logout", { method: "POST" }).then(function () { setAuthedUI(false); });
      });
    }
    if (addForm) {
      addForm.addEventListener("submit", function (e) {
        e.preventDefault();
        addErr.textContent = ""; addOk.textContent = "";
        var submitBtn = addForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        fetch("/api/mods", { method: "POST", body: new FormData(addForm) })
          .then(function (r) { if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Could not add that mod."); }); return r.json(); })
          .then(function () { addForm.reset(); addOk.textContent = "Mod published."; return loadMods(); })
          .then(function () { renderManageList(); })
          .catch(function (err) { addErr.textContent = err.message; })
          .then(function () { if (submitBtn) submitBtn.disabled = false; });
      });
    }
    if (manageList) {
      manageList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-delete-id]");
        if (!btn) return;
        if (!window.confirm("Remove this mod and delete its jar file?")) return;
        fetch("/api/mods/" + encodeURIComponent(btn.dataset.deleteId), { method: "DELETE" })
          .then(function (r) { if (!r.ok) throw new Error("Could not remove that mod."); return loadMods(); })
          .then(function () { renderManageList(); })
          .catch(function (err) { window.alert(err.message); });
      });
    }
  }

  /* ── Boot ─────────────────────────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    setupGlobalModActions();
    setupReveal();
    setupCounts();
    setupProgress();
    setupNav();
    setupFaq();
    setupTop();
    setupAdmin();
    loadMods().then(function () { setupCmdk(); });
  });
})();
