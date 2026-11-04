/* Essentials-first layout for the patient forms.
 *
 * Required fields are pulled into an "Essentials" box at the top, arranged in
 * labelled rows (Patient, Body measurements, Key labs, Cancer & treatment,
 * Feeding). Everything else is folded into a collapsed "More details" area
 * that opens with a down-arrow button.
 *
 * Fields are MOVED, not copied, so ids, inline handlers, validation and save
 * logic keep working unchanged.
 *
 * GQEssentials.setup({
 *   root, basics, cards,           // form card, top demographics grid, clinical-cards container
 *   rows: [{ title, ids:[...] }],  // essentials rows, by input id
 *   relabel: { id: 'Text' },       // simpler label inside Essentials
 *   hints:   { id: 'hint text' },  // small line under the input
 *   markRequired: [ids],           // add the red * to these labels
 *   hide: [ids],                   // fields not used any more (kept in DOM, hidden)
 *   firstPanels: [ids],            // panels (found by a field id) shown first in the fold
 *   widePanels: [ids],             // panels (found by a field id) that take a full row
 *   basicsInto: id,                // optional leftover basics go into this field's panel
 *   resetOnShow: true              // collapse again every time root is re-shown
 * });
 */
(function (global) {
  'use strict';

  function injectStyles() {
    if (document.getElementById('gq-ess-styles')) return;
    const css = `
      .gq-ess { border:2px solid var(--cyan, #0369a1); border-radius:14px; padding:18px 20px 6px;
                margin:0 0 18px; background:var(--surface, #fff); }
      .gq-ess-head { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
      .gq-ess-title { font-size:16px; font-weight:800; color:var(--text, #0e2247); }
      .gq-ess-sub { font-size:12px; color:var(--text-2, #64748b); }
      .gq-ess-row { padding:12px 0 14px; border-top:1px solid var(--border, rgba(0,0,0,.06)); }
      .gq-ess-row:first-of-type { border-top:0; }
      .gq-ess-rowtitle { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
                         color:var(--cyan, #0369a1); margin:0 0 10px; }
      .gq-ess-grid { display:grid; grid-template-columns:repeat(var(--gq-cols, 4), minmax(0, 1fr));
                     gap:14px 16px; align-items:start; }
      .gq-ess-grid .form-group { min-width:0; margin:0; grid-column:auto !important; }
      .gq-ess-grid .form-group > label { min-height:2.4em; display:flex; align-items:flex-end;
                                         flex-wrap:wrap; gap:4px; line-height:1.25; }
      .gq-ess .ftag-ess, .gq-ess .status-badge:empty { display:none; }
      .gq-ess .tag-box { margin-top:0; }
      .gq-ess-hint { font-size:11px; color:var(--text-2, #64748b); margin-top:4px; }
      .gq-more-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px;
                        margin:4px 0 0; padding:14px 18px; border-radius:12px; cursor:pointer;
                        border:1px dashed var(--border-2, rgba(0,0,0,.15)); background:var(--surface-2, #f8fafc);
                        color:var(--text, #0e2247); font-size:14px; font-weight:700; text-align:left; }
      .gq-more-toggle:hover { border-style:solid; }
      .gq-more-toggle .gq-more-hint { font-size:12px; font-weight:500; color:var(--text-2, #64748b); }
      .gq-more-toggle .gq-arrow { font-size:16px; transition:transform .2s; flex:none; }
      .gq-more-toggle[aria-expanded="true"] .gq-arrow { transform:rotate(180deg); }
      .gq-more { margin-top:16px; }
      .gq-more[hidden] { display:none !important; }
      .gq-more-grid { display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
                      gap:20px !important; align-items:stretch !important; margin-top:0 !important; }
      .gq-more-grid > .ai-panel { margin:0 !important; min-height:0 !important; }
      .gq-more-grid > .gq-full { grid-column:1 / -1 !important; }
      @media (max-width: 1100px) { .gq-ess-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 760px) {
        .gq-more-grid { grid-template-columns:1fr !important; }
      }
      @media (max-width: 560px) { .gq-ess-grid { grid-template-columns:1fr; } }
    `;
    const s = document.createElement('style');
    s.id = 'gq-ess-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function groupOf(id) {
    const el = document.getElementById(id);
    return el ? el.closest('.form-group') : null;
  }

  function relabel(lbl, text) {
    // Keep status badges / AI source tags, replace the wording.
    Array.prototype.slice.call(lbl.childNodes).forEach(function (n) {
      const keep = n.nodeType === 1 && /\b(ftag|status-badge)\b/.test(n.className || '');
      if (!keep) lbl.removeChild(n);
    });
    lbl.insertBefore(document.createTextNode(text + ' '), lbl.firstChild);
  }

  function setup(cfg) {
    const root = cfg && cfg.root;
    const basics = cfg && cfg.basics;
    const cards = cfg && cfg.cards;
    if (!root || !basics || !cards || root.querySelector('.gq-ess')) return;
    injectStyles();

    (cfg.hide || []).forEach(function (id) {
      const g = groupOf(id);
      if (g) g.style.display = 'none';
    });
    (cfg.markRequired || []).forEach(function (id) {
      const g = groupOf(id);
      const l = g && g.querySelector('label');
      if (l) l.classList.add('required');
    });

    // ---- 1. Essentials box, in labelled rows -------------------------------
    const ess = document.createElement('div');
    ess.className = 'gq-ess';
    ess.innerHTML =
      '<div class="gq-ess-head"><span class="gq-ess-title">Essentials</span>' +
      '<span class="gq-ess-sub">Required to generate the nutrition plan</span></div>';

    const used = [];
    function addRow(title, groups) {
      groups = groups.filter(Boolean);
      if (!groups.length) return;
      const row = document.createElement('div');
      row.className = 'gq-ess-row';
      row.innerHTML = '<div class="gq-ess-rowtitle"></div><div class="gq-ess-grid"></div>';
      row.firstChild.textContent = title;
      const grid = row.lastChild;
      grid.style.setProperty('--gq-cols', String(Math.min(5, Math.max(groups.length, 3))));
      groups.forEach(function (g) { grid.appendChild(g); used.push(g); });
      ess.appendChild(row);
    }

    (cfg.rows || []).forEach(function (r) {
      addRow(r.title, r.ids.map(groupOf).filter(function (g) { return g && used.indexOf(g) === -1; }));
    });
    // Any other required field not placed in a row still comes up.
    const rest = [];
    root.querySelectorAll('label.required').forEach(function (lbl) {
      const g = lbl.closest('.form-group');
      if (g && used.indexOf(g) === -1 && rest.indexOf(g) === -1 && g.style.display !== 'none') rest.push(g);
    });
    addRow('Other required', rest);

    // Into the page before looking fields up by id again.
    basics.parentNode.insertBefore(ess, basics);

    Object.keys(cfg.relabel || {}).forEach(function (id) {
      const g = groupOf(id);
      const l = g && g.querySelector('label');
      if (l) relabel(l, cfg.relabel[id]);
    });
    Object.keys(cfg.hints || {}).forEach(function (id) {
      const g = groupOf(id);
      if (!g || g.querySelector('.gq-ess-hint')) return;
      const h = document.createElement('div');
      h.className = 'gq-ess-hint';
      h.textContent = cfg.hints[id];
      const msg = g.querySelector('.validation-msg');
      if (msg) g.insertBefore(h, msg); else g.appendChild(h);
    });

    // ---- 2. Collapsible area for everything optional -----------------------
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'gq-more-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<span><span class="gq-more-label">Show more details (optional)</span><br>' +
      '<span class="gq-more-hint">Other labs, micronutrients, cancer stage, radiation details, toxicity, body composition, lifestyle</span></span>' +
      '<span class="gq-arrow">&#9660;</span>';

    const more = document.createElement('div');
    more.className = 'gq-more';
    more.hidden = true;

    const panelGrid = document.createElement('div');
    panelGrid.className = 'gq-more-grid';
    more.appendChild(panelGrid);

    const panels = Array.prototype.slice.call(cards.children).filter(function (el) {
      // Only field sections move; calculators and action buttons stay put.
      return el.classList.contains('ai-panel') && el.querySelector('.form-grid .form-group');
    });

    // Leftover optional basics (weight basis, usual weight…) join a panel
    // instead of floating on their own above the cards.
    const leftovers = Array.prototype.slice.call(basics.querySelectorAll(':scope > .form-group'));
    const target = cfg.basicsInto && groupOf(cfg.basicsInto);
    const targetGrid = target && target.parentNode;
    if (leftovers.length && targetGrid) {
      leftovers.slice().reverse().forEach(function (g) { targetGrid.insertBefore(g, targetGrid.firstChild); });
    }
    if (basics.querySelector('.form-group')) more.insertBefore(basics, panelGrid);
    else basics.style.display = 'none';

    // Half-width cards pair up first; wide cards follow, one per row.
    const wideIds = (cfg.widePanels || []).map(function (id) {
      const g = groupOf(id); return g && g.closest('.ai-panel');
    });
    const isWide = function (p) {
      return wideIds.indexOf(p) !== -1 || /1\s*\/\s*-1/.test(p.style.gridColumn || '');
    };
    // Panels named in firstPanels lead the fold, each on its own row.
    const first = (cfg.firstPanels || []).map(function (id) {
      const g = groupOf(id); return g && g.closest('.ai-panel');
    }).filter(function (p, i, a) { return p && panels.indexOf(p) !== -1 && a.indexOf(p) === i; });
    const restPanels = panels.filter(function (p) { return first.indexOf(p) === -1; });
    const half = restPanels.filter(function (p) { return !isWide(p); });
    const wide = first.concat(restPanels.filter(isWide));
    if (half.length % 2 === 1) wide.push(half.pop());
    first.concat(half, wide.slice(first.length)).forEach(function (p) {
      if (wide.indexOf(p) !== -1) p.classList.add('gq-full');
      panelGrid.appendChild(p);
    });

    ess.parentNode.insertBefore(toggle, ess.nextSibling);
    toggle.parentNode.insertBefore(more, toggle.nextSibling);
    if (!cards.children.length) cards.style.display = 'none';

    function setOpen(open) {
      more.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.querySelector('.gq-more-label').textContent =
        open ? 'Hide optional details' : 'Show more details (optional)';
    }
    toggle.addEventListener('click', function () { setOpen(more.hidden); });

    // Open automatically if validation flags a field inside the fold.
    new MutationObserver(function () {
      if (!more.hidden) return;
      if (more.querySelector('.field-invalid, .validation-msg.validation-error')) setOpen(true);
    }).observe(more, { subtree: true, attributes: true, attributeFilter: ['class'] });

    // Start collapsed each time the form is opened.
    if (cfg.resetOnShow) {
      let wasVisible = root.style.display !== 'none';
      new MutationObserver(function () {
        const visible = root.style.display !== 'none';
        if (visible && !wasVisible) setOpen(false);
        wasVisible = visible;
      }).observe(root, { attributes: true, attributeFilter: ['style'] });
    }

    setOpen(false);
    return { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
  }

  global.GQEssentials = { setup: setup };
})(window);
