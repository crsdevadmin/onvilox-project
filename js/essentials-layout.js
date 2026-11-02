/* Essentials-first layout for the patient forms.
 *
 * Moves every field whose label is marked `.required` into an "Essentials"
 * box at the top of the form, and folds everything else (optional labs,
 * oncology detail, radiation, toxicity, lifestyle) into a collapsed
 * "More details" area that opens with a down-arrow button.
 *
 * Fields are MOVED, not copied, so their ids, inline handlers, validation
 * and save logic keep working unchanged.
 *
 * Usage:
 *   GQEssentials.setup({
 *     root:      element that holds the form,
 *     basics:    the top demographics .form-grid,
 *     cards:     the container holding the clinical .ai-panel sections,
 *     extra:     [{id, note}] conditionally-required fields to pull up too,
 *     resetOnShow: true  // collapse again every time root is re-shown
 *   });
 */
(function (global) {
  'use strict';

  function injectStyles() {
    if (document.getElementById('gq-ess-styles')) return;
    const css = `
      .gq-ess { border:2px solid var(--cyan, #0369a1); border-radius:14px; padding:18px 18px 8px;
                margin:0 0 18px; background:var(--surface, #fff); }
      .gq-ess-head { display:flex; align-items:baseline; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
      .gq-ess-title { font-size:15px; font-weight:800; color:var(--text, #0e2247); }
      .gq-ess-sub { font-size:12px; color:var(--text-2, #64748b); }
      .gq-ess-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:16px; }
      .gq-ess-grid .form-group { min-width:0; }
      .gq-ess-note { font-weight:500; font-size:10.5px; color:var(--text-2, #64748b); }
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
      @media (max-width: 640px) { .gq-ess-grid { grid-template-columns:1fr; } }
    `;
    const s = document.createElement('style');
    s.id = 'gq-ess-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function setup(cfg) {
    const root = cfg && cfg.root;
    const basics = cfg && cfg.basics;
    const cards = cfg && cfg.cards;
    if (!root || !basics || !cards || root.querySelector('.gq-ess')) return;
    injectStyles();

    // 1. Essentials box with every required field, in page order.
    const ess = document.createElement('div');
    ess.className = 'gq-ess';
    ess.innerHTML =
      '<div class="gq-ess-head"><span class="gq-ess-title">Essentials</span>' +
      '<span class="gq-ess-sub">Required to generate the nutrition plan</span></div>' +
      '<div class="gq-ess-grid"></div>';
    const essGrid = ess.querySelector('.gq-ess-grid');

    const groups = [];
    root.querySelectorAll('label.required').forEach(function (lbl) {
      const g = lbl.closest('.form-group');
      if (g && groups.indexOf(g) === -1 && !g.closest('.gq-ess')) groups.push(g);
    });
    // Conditionally-required fields (e.g. Chemo Regimen, which the save
    // checks unless the patient is RT-only) are listed by id.
    (cfg.extra || []).forEach(function (x) {
      const el = document.getElementById(x.id);
      const g = el && el.closest('.form-group');
      if (!g || groups.indexOf(g) !== -1) return;
      if (x.markRequired) {
        const lbl0 = g.querySelector('label');
        if (lbl0) lbl0.classList.add('required');
      }
      if (x.note) {
        const lbl = g.querySelector('label');
        if (lbl && !lbl.querySelector('.gq-ess-note')) {
          const n = document.createElement('span');
          n.className = 'gq-ess-note';
          n.textContent = ' ' + x.note;
          lbl.appendChild(n);
        }
      }
      groups.push(g);
    });
    groups.sort(function (a, b) {
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    groups.forEach(function (g) {
      if (g.style.gridColumn) g.style.gridColumn = 'span 2';
      essGrid.appendChild(g);
    });
    basics.parentNode.insertBefore(ess, basics);

    // 2. Collapsible area for everything optional.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'gq-more-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<span><span class="gq-more-label">Show more details (optional)</span><br>' +
      '<span class="gq-more-hint">Other labs, micronutrients, cancer stage &amp; metastasis, radiation details, toxicity, body composition, lifestyle</span></span>' +
      '<span class="gq-arrow">&#9660;</span>';

    const more = document.createElement('div');
    more.className = 'gq-more';
    more.hidden = true;

    // The clinical sections keep their 2-up card layout inside the fold.
    const panelGrid = document.createElement('div');
    panelGrid.className = cards.className;
    panelGrid.setAttribute('style', cards.getAttribute('style') || '');
    panelGrid.style.marginTop = '20px';

    if (basics.querySelector('.form-group')) more.appendChild(basics);
    else basics.style.display = 'none';
    more.appendChild(panelGrid);

    Array.prototype.slice.call(cards.children).forEach(function (el) {
      // Only the field sections move; calculators and action buttons stay put.
      if (el.classList.contains('ai-panel') && el.querySelector('.form-grid .form-group')) {
        panelGrid.appendChild(el);
      }
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
      const bad = more.querySelector('.field-invalid, .validation-msg.validation-error');
      if (bad) setOpen(true);
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
