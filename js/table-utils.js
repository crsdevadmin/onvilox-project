/**
 * table-utils.js — reusable sortable + paginated tables
 *
 * Usage:
 *   const dt = new DataTable('myTbodyId', { pageSize: 25 });
 *   // after every render call:
 *   dt.refresh();
 *
 * Mark sortable <th> elements with data-sort="N" (0-based col index).
 * Add data-type="num" for numeric sort, data-type="date" for date sort.
 * Sub-rows (e.g. history rows) should have class "dt-subrow" — they follow
 * their parent and are never sorted/paginated independently.
 */
(function (global) {
  'use strict';

  var _registry = {};
  var _uid = 0;

  // ── inject shared styles once ──────────────────────────────
  function injectStyles() {
    if (document.getElementById('dt-styles')) return;
    var s = document.createElement('style');
    s.id = 'dt-styles';
    s.textContent = [
      'th[data-sort]{cursor:pointer;user-select:none;white-space:nowrap;}',
      'th[data-sort]::after{content:" ⇅";font-size:10px;opacity:.4;margin-left:3px;}',
      'th[data-sort][data-asc]::after{content:" ↑";opacity:1;}',
      'th[data-sort][data-desc]::after{content:" ↓";opacity:1;}',
      '.dt-pager{display:flex;gap:5px;align-items:center;padding:10px 0 4px;',
      'flex-wrap:wrap;font-size:13px;color:var(--text-2);}',
      '.dt-pager .dt-info{margin-right:6px;}',
      '.dt-btn{background:var(--surface-2);border:1px solid var(--border);',
      'color:var(--text);border-radius:6px;padding:4px 10px;font-size:12px;',
      'cursor:pointer;line-height:1.4;}',
      '.dt-btn:hover:not(:disabled){background:var(--surface);}',
      '.dt-btn:disabled{opacity:.4;cursor:default;}',
      '.dt-btn.dt-active{background:#0e2247;color:#fff;border-color:#0e2247;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── DataTable constructor ──────────────────────────────────
  function DataTable(tbodyId, opts) {
    opts = opts || {};
    this._id  = 'dt' + (_uid++);
    this._pageSize = opts.pageSize || 25;
    this._page = 1;
    this._sortCol = -1;
    this._sortDir = 1;
    this._rows = [];       // visible (non-subrow) TR elements in sort order
    this._subMap = {};     // index → array of sub-row TRs that follow it

    this._tbody = document.getElementById(tbodyId);
    if (!this._tbody) { console.warn('DataTable: tbody #' + tbodyId + ' not found'); return; }
    this._table = this._tbody.closest('table');
    this._thead = this._table.querySelector('thead');

    // pager container inserted right after the table's parent scroll div or the table itself
    this._pager = document.createElement('div');
    this._pager.className = 'dt-pager';
    this._pager.dataset.dtId = this._id;
    var anchor = this._table.parentNode;
    anchor.parentNode.insertBefore(this._pager, anchor.nextSibling);

    _registry[this._id] = this;
    injectStyles();
    this._bindHeaders();
  }

  DataTable.prototype._bindHeaders = function () {
    if (!this._thead) return;
    var self = this;
    this._thead.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () { self._onSort(th); });
    });
  };

  DataTable.prototype._onSort = function (th) {
    var col = parseInt(th.dataset.sort, 10);
    if (this._sortCol === col) {
      this._sortDir *= -1;
    } else {
      this._sortCol = col;
      this._sortDir = 1;
    }
    // update visual indicators
    if (this._thead) {
      this._thead.querySelectorAll('th').forEach(function (t) {
        t.removeAttribute('data-asc');
        t.removeAttribute('data-desc');
      });
      th.setAttribute(this._sortDir === 1 ? 'data-asc' : 'data-desc', '');
    }
    this.page = 1;
    this._applySort();
    this._render();
  };

  DataTable.prototype._applySort = function () {
    var col  = this._sortCol;
    var dir  = this._sortDir;
    var th   = this._thead ? this._thead.querySelectorAll('th')[col] : null;
    var type = th ? (th.dataset.type || 'text') : 'text';
    var rows = this._rows;

    rows.sort(function (a, b) {
      var at = a.cells[col] ? a.cells[col].textContent.trim() : '';
      var bt = b.cells[col] ? b.cells[col].textContent.trim() : '';
      var cmp;
      if (type === 'num') {
        cmp = (parseFloat(at) || 0) - (parseFloat(bt) || 0);
      } else if (type === 'date') {
        // dd/mm/yyyy → sortable string
        var ad = at.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
        var bd = bt.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
        cmp = ad.localeCompare(bd);
      } else {
        cmp = at.localeCompare(bt, undefined, { numeric: true, sensitivity: 'base' });
      }
      return cmp * dir;
    });
  };

  // call after every tbody innerHTML update
  DataTable.prototype.refresh = function () {
    // collect rows and sub-rows
    var allTrs = Array.from(this._tbody.querySelectorAll('tr'));
    this._rows   = [];
    this._subMap = {};
    var lastIdx  = -1;

    allTrs.forEach(function (tr) {
      if (tr.classList.contains('dt-subrow')) {
        if (lastIdx >= 0) {
          this._subMap[lastIdx] = this._subMap[lastIdx] || [];
          this._subMap[lastIdx].push(tr);
        }
      } else {
        lastIdx = this._rows.length;
        this._rows.push(tr);
      }
    }, this);

    // re-apply existing sort
    if (this._sortCol >= 0) this._applySort();

    this._page = 1;
    this._render();
  };

  DataTable.prototype._render = function () {
    var total    = this._rows.length;
    var pageSize = this._pageSize;
    var pages    = Math.max(1, Math.ceil(total / pageSize));
    this._page   = Math.min(Math.max(1, this._page), pages);
    var start    = (this._page - 1) * pageSize;
    var end      = Math.min(start + pageSize, total);
    var subMap   = this._subMap;

    // reorder DOM and show/hide
    var tbody = this._tbody;
    this._rows.forEach(function (tr, i) {
      tbody.appendChild(tr);
      var subs = subMap[i] || [];
      subs.forEach(function (s) { tbody.appendChild(s); });
      var vis = i >= start && i < end;
      tr.style.display = vis ? '' : 'none';
      subs.forEach(function (s) { s.style.display = vis ? '' : 'none'; });
    });

    // pager
    var pager = this._pager;
    if (total <= pageSize) { pager.innerHTML = ''; return; }

    var id = this._id;
    var p  = this._page;
    var lo = Math.max(1, p - 3);
    var hi = Math.min(pages, p + 3);
    var parts = [];

    parts.push('<span class="dt-info">Showing ' + (start + 1) + '–' + end + ' of ' + total + '</span>');
    parts.push('<button class="dt-btn"' + (p <= 1 ? ' disabled' : '') +
      ' onclick="DataTable._go(\'' + id + '\',' + (p - 1) + ')">&#8592; Prev</button>');

    if (lo > 1) parts.push('<span style="padding:0 2px;">1</span><span>…</span>');
    for (var pg = lo; pg <= hi; pg++) {
      parts.push('<button class="dt-btn' + (pg === p ? ' dt-active' : '') +
        '" onclick="DataTable._go(\'' + id + '\',' + pg + ')">' + pg + '</button>');
    }
    if (hi < pages) parts.push('<span>…</span><span style="padding:0 2px;">' + pages + '</span>');
    parts.push('<button class="dt-btn"' + (p >= pages ? ' disabled' : '') +
      ' onclick="DataTable._go(\'' + id + '\',' + (p + 1) + ')">Next &#8594;</button>');

    pager.innerHTML = parts.join('');
  };

  // static helper called by pager button onclick
  DataTable._go = function (id, page) {
    var dt = _registry[id];
    if (!dt) return;
    dt._page = page;
    dt._render();
  };

  DataTable._registry = _registry;

  global.DataTable = DataTable;
}(window));
