/*
 * dragdrop.js — Notion-style drag & drop for the block list.
 * Exposes window.CosyDnD = { DragController, LayoutEngine, IndicatorRenderer }.
 *
 * Three cleanly separated pieces:
 *  - LayoutEngine: pure hit-testing over card rects, no DOM writes.
 *  - IndicatorRenderer: all DOM feedback (ghost clone, dimmed source, one
 *    reused accent-line indicator). Nothing here mutates app state.
 *  - DragController: pointer-event state machine wiring the two together and
 *    calling back into the host (app.js) via onDrop/onCancel. It never
 *    touches storage or app state directly.
 *
 * Loaded before app.js. Vanilla ES5-ish (var, IIFE) to match the codebase.
 */
(function () {
  'use strict';

  // ===========================================================================
  //  LayoutEngine — pure hit-testing, no DOM writes
  // ===========================================================================
  var LayoutEngine = {
    // cards: array of { id, el } (el = .block-card node). Returns rows of
    // rects grouped by vertical overlap (reading order), skipping any card
    // whose id === excludeId (the one currently being dragged).
    snapshotRects: function (cards, excludeId) {
      var rects = [];
      cards.forEach(function (c) {
        if (c.id === excludeId) return;
        var box = c.el.getBoundingClientRect();
        rects.push({ id: c.id, box: box });
      });

      var rows = [];
      rects.forEach(function (r) {
        var row = rows.filter(function (rw) {
          return !(r.box.bottom <= rw.top || r.box.top >= rw.bottom);
        })[0];
        if (row) {
          row.items.push(r);
          row.top = Math.min(row.top, r.box.top);
          row.bottom = Math.max(row.bottom, r.box.bottom);
        } else {
          rows.push({ top: r.box.top, bottom: r.box.bottom, items: [r] });
        }
      });
      rows.sort(function (a, b) { return a.top - b.top; });
      rows.forEach(function (rw) {
        rw.items.sort(function (a, b) { return a.box.left - b.box.left; });
      });
      return rows;
    },

    // hitTest(x, y, rows, listRect) -> { beforeId: id|null, indicator: {...} }
    // rows come from snapshotRects. listRect is the container's bounding
    // rect, used to size a horizontal (between-rows) indicator to the full
    // list width.
    hitTest: function (x, y, rows, listRect) {
      if (!rows.length) {
        return { beforeId: null, indicator: null };
      }

      // Above every row -> insert before the very first card.
      if (y < rows[0].top) {
        var firstItem = rows[0].items[0];
        return {
          beforeId: firstItem.id,
          indicator: {
            axis: 'h', x: listRect.left, y: rows[0].top - 4,
            length: listRect.width
          }
        };
      }

      // Below every row -> append at the end.
      var lastRow = rows[rows.length - 1];
      if (y > lastRow.bottom) {
        return { beforeId: null, indicator: {
          axis: 'h', x: listRect.left, y: lastRow.bottom + 4, length: listRect.width
        } };
      }

      // Find the row the pointer is vertically inside.
      var targetRow = null, targetIdx = -1;
      for (var i = 0; i < rows.length; i++) {
        if (y >= rows[i].top && y <= rows[i].bottom) { targetRow = rows[i]; targetIdx = i; break; }
      }

      if (!targetRow) {
        // Between two rows: pick the row boundary closest to y, insert
        // before the first card of the lower row.
        for (var k = 0; k < rows.length - 1; k++) {
          if (y > rows[k].bottom && y < rows[k + 1].top) {
            var boundary = (rows[k].bottom + rows[k + 1].top) / 2;
            return {
              beforeId: rows[k + 1].items[0].id,
              indicator: { axis: 'h', x: listRect.left, y: boundary, length: listRect.width }
            };
          }
        }
        // Fallback (shouldn't normally hit) — nearest row by center distance.
        var bestDist = Infinity;
        rows.forEach(function (rw, idx) {
          var center = (rw.top + rw.bottom) / 2;
          var d = Math.abs(y - center);
          if (d < bestDist) { bestDist = d; targetRow = rw; targetIdx = idx; }
        });
      }

      // Inside a row: compare against each card's horizontal midpoint.
      var items = targetRow.items;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var midX = it.box.left + it.box.width / 2;
        if (x < midX) {
          return {
            beforeId: it.id,
            indicator: {
              axis: 'v', x: it.box.left - 7, y: targetRow.top,
              length: targetRow.bottom - targetRow.top
            }
          };
        }
      }
      // Past the last card in this row -> insert after it (before the next
      // row's first card, or at the end if this is the last row).
      var lastItem = items[items.length - 1];
      var nextRow = rows[targetIdx + 1];
      if (nextRow) {
        return {
          beforeId: nextRow.items[0].id,
          indicator: {
            axis: 'v', x: lastItem.box.right + 7, y: targetRow.top,
            length: targetRow.bottom - targetRow.top
          }
        };
      }
      return {
        beforeId: null,
        indicator: {
          axis: 'v', x: lastItem.box.right + 7, y: targetRow.top,
          length: targetRow.bottom - targetRow.top
        }
      };
    }
  };

  // ===========================================================================
  //  IndicatorRenderer — all DOM feedback (ghost, dimmed source, accent line)
  // ===========================================================================
  function IndicatorRenderer() {
    this.ghost = null;
    this.indicator = null;
    this.sourceEl = null;
  }

  IndicatorRenderer.prototype.start = function (sourceEl, pointerX, pointerY) {
    var box = sourceEl.getBoundingClientRect();
    var ghost = sourceEl.cloneNode(true);
    ghost.className = 'dnd-ghost';
    ghost.style.width = box.width + 'px';
    ghost.style.height = box.height + 'px';
    ghost.style.left = '0px';
    ghost.style.top = '0px';
    // Offset between the pointer and the card's top-left, so the ghost
    // tracks under the cursor at the same relative spot it was grabbed.
    this._offsetX = pointerX - box.left;
    this._offsetY = pointerY - box.top;
    document.body.appendChild(ghost);
    this.ghost = ghost;
    this.moveGhost(pointerX, pointerY);

    this.sourceEl = sourceEl;
    sourceEl.classList.add('drag-source');

    var indicator = document.createElement('div');
    indicator.className = 'dnd-indicator';
    indicator.hidden = true;
    document.body.appendChild(indicator);
    this.indicator = indicator;
  };

  IndicatorRenderer.prototype.moveGhost = function (pointerX, pointerY) {
    if (!this.ghost) return;
    var x = pointerX - this._offsetX;
    var y = pointerY - this._offsetY;
    this.ghost.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(.97) rotate(1.5deg)';
  };

  IndicatorRenderer.prototype.showIndicator = function (ind) {
    if (!this.indicator) return;
    if (!ind) { this.indicator.hidden = true; return; }
    this.indicator.hidden = false;
    if (ind.axis === 'v') {
      this.indicator.style.width = '3px';
      this.indicator.style.height = ind.length + 'px';
    } else {
      this.indicator.style.width = ind.length + 'px';
      this.indicator.style.height = '3px';
    }
    this.indicator.style.transform = 'translate3d(' + ind.x + 'px,' + ind.y + 'px,0)';
  };

  IndicatorRenderer.prototype.cleanup = function () {
    if (this.ghost && this.ghost.parentNode) this.ghost.parentNode.removeChild(this.ghost);
    if (this.indicator && this.indicator.parentNode) this.indicator.parentNode.removeChild(this.indicator);
    if (this.sourceEl) this.sourceEl.classList.remove('drag-source');
    this.ghost = null; this.indicator = null; this.sourceEl = null;
  };

  // ===========================================================================
  //  DragController — pointer-event state machine
  // ===========================================================================
  // opts: { container, scrollContainer, canDrag(card), getCards(), onDrop(draggedId, beforeId), onCancel() }
  function DragController(opts) {
    this.opts = opts;
    this.renderer = new IndicatorRenderer();
    this.dragging = false;      // past the 5px threshold, actual drag underway
    this.armed = false;         // pointerdown seen on a handle, awaiting threshold
    this.draggedId = null;
    this.draggedEl = null;
    this.startX = 0; this.startY = 0;
    this.pointerId = null;
    this.rows = [];
    this.lastX = 0; this.lastY = 0;
    this.rafPending = false;
    this.scrollRaf = null;
    this.currentHit = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    opts.container.addEventListener('pointerdown', this._onPointerDown);
  }

  DragController.prototype._onPointerDown = function (e) {
    if (e.button !== undefined && e.button !== 0) return; // left button / primary touch only
    var handle = e.target.closest && e.target.closest('.block-handle');
    if (!handle) return;
    var card = handle.closest('.block-card');
    if (!card) return;
    if (this.opts.canDrag && !this.opts.canDrag(card)) return;

    this.armed = true;
    this.draggedEl = card;
    this.draggedId = card.dataset.id;
    this.startX = e.clientX; this.startY = e.clientY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.pointerId = e.pointerId;

    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('keydown', this._onKeyDown);
  };

  DragController.prototype._beginDrag = function (e) {
    this.dragging = true;
    try { this.draggedEl.setPointerCapture(this.pointerId); } catch (_) {}
    document.body.classList.add('dnd-active');
    this.renderer.start(this.draggedEl, e.clientX, e.clientY);
    this._resnapshot();
    this._scheduleHitTest();
  };

  DragController.prototype._resnapshot = function () {
    var cards = this.opts.getCards();
    this.rows = LayoutEngine.snapshotRects(cards, this.draggedId);
  };

  DragController.prototype._onPointerMove = function (e) {
    this.lastX = e.clientX; this.lastY = e.clientY;

    if (!this.dragging) {
      if (!this.armed) return;
      var dx = e.clientX - this.startX, dy = e.clientY - this.startY;
      if ((dx * dx + dy * dy) < 25) return; // 5px threshold
      this._beginDrag(e);
      return;
    }
    this.renderer.moveGhost(e.clientX, e.clientY);
    this._scheduleHitTest();
    this._maybeAutoScroll(e.clientX, e.clientY);
  };

  // rAF-throttled: never do layout/hit-test work more than once per frame.
  DragController.prototype._scheduleHitTest = function () {
    if (this.rafPending) return;
    this.rafPending = true;
    var self = this;
    requestAnimationFrame(function () {
      self.rafPending = false;
      if (!self.dragging) return;
      var listRect = self.opts.container.getBoundingClientRect();
      var hit = LayoutEngine.hitTest(self.lastX, self.lastY, self.rows, listRect);
      self.currentHit = hit;
      self.renderer.showIndicator(hit.indicator);
    });
  };

  DragController.prototype._maybeAutoScroll = function (x, y) {
    var sc = this.opts.scrollContainer;
    if (!sc) return;
    var r = sc.getBoundingClientRect();
    var edge = 48;
    var dist, dir;
    if (y < r.top + edge) { dist = (r.top + edge) - y; dir = -1; }
    else if (y > r.bottom - edge) { dist = y - (r.bottom - edge); dir = 1; }
    else { this._stopAutoScroll(); return; }

    var speed = Math.max(2, Math.min(18, (dist / edge) * 18));
    this._startAutoScroll(sc, dir * speed);
  };

  DragController.prototype._startAutoScroll = function (sc, speed) {
    this._autoScrollSpeed = speed;
    if (this.scrollRaf) return;
    var self = this;
    function tick() {
      if (!self.dragging) { self.scrollRaf = null; return; }
      sc.scrollTop += self._autoScrollSpeed;
      self._resnapshot();
      self._scheduleHitTest();
      self.scrollRaf = requestAnimationFrame(tick);
    }
    this.scrollRaf = requestAnimationFrame(tick);
  };

  DragController.prototype._stopAutoScroll = function () {
    if (this.scrollRaf) { cancelAnimationFrame(this.scrollRaf); this.scrollRaf = null; }
  };

  DragController.prototype._onKeyDown = function (e) {
    if (e.key === 'Escape' && (this.dragging || this.armed)) {
      e.preventDefault();
      this._cancel();
    }
  };

  DragController.prototype._onPointerUp = function () {
    if (this.dragging) {
      // Capture before _teardown() resets draggedId/currentHit to null.
      var draggedId = this.draggedId;
      var hit = this.currentHit;
      this._teardown();
      if (this.opts.onDrop) this.opts.onDrop(draggedId, hit ? hit.beforeId : null);
    } else {
      this._teardown();
    }
  };

  DragController.prototype._cancel = function () {
    var wasDragging = this.dragging;
    this._teardown();
    if (wasDragging && this.opts.onCancel) this.opts.onCancel();
  };

  DragController.prototype._teardown = function () {
    this._stopAutoScroll();
    if (this.pointerId != null && this.draggedEl) {
      try { this.draggedEl.releasePointerCapture(this.pointerId); } catch (_) {}
    }
    this.renderer.cleanup();
    document.body.classList.remove('dnd-active');
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('keydown', this._onKeyDown);
    this.dragging = false; this.armed = false;
    this.draggedId = null; this.draggedEl = null; this.pointerId = null;
    this.rows = []; this.currentHit = null;
  };

  DragController.prototype.destroy = function () {
    this._teardown();
    this.opts.container.removeEventListener('pointerdown', this._onPointerDown);
  };

  window.CosyDnD = {
    DragController: DragController,
    LayoutEngine: LayoutEngine,
    IndicatorRenderer: IndicatorRenderer
  };
})();
