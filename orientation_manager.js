/**
 * ═══════════════════════════════════════════════════════════
 *  OASIS — ORIENTATION & VIEWPORT MANAGER
 *  orientation_manager.js  ·  v1.0.0
 * ═══════════════════════════════════════════════════════════
 *
 *  Responsibilities
 *  ─────────────────
 *  1. Real viewport height  — sets --vh CSS variable so layouts
 *     never get cropped by mobile browser chrome or the iOS
 *     nav bar. Replaces all "100vh" usages with calc(var(--vh)*100).
 *
 *  2. Orientation awareness — listens to both the modern
 *     screen.orientation API and the legacy orientationchange
 *     event; fires a single debounced "oasis:orientation" custom
 *     event that the rest of the app can listen to.
 *
 *  3. Device auto-rotate respect — if the device's system
 *     auto-rotate is OFF, the OS itself blocks rotation, so no
 *     lock is needed. If it is ON, the app allows both portrait
 *     and landscape and adapts gracefully. In PWA standalone mode
 *     we call screen.orientation.lock('natural') so the OS setting
 *     always wins.
 *
 *  4. Keyboard detection — uses visualViewport to distinguish a
 *     soft keyboard resize from a true rotation resize, preventing
 *     spurious layout recalculations when the user types.
 *
 *  5. Post-rotation recalculation — resizes Chart.js instances,
 *     re-renders the active tab, and re-measures modals/overlays
 *     after each real orientation change.
 *
 *  6. Smooth transitions — adds a transient .rotating class to
 *     <body> during the animation so CSS can apply transitions
 *     without affecting normal hover/tap interactivity.
 *
 *  7. Safe-area insets — reads env(safe-area-inset-*) and exposes
 *     them as --sai-top / --sai-bottom CSS variables for use in
 *     fullscreen / notch-aware layouts.
 *
 *  Usage
 *  ──────
 *  Include this script BEFORE app.js in index.html.
 *  window.OasisOrientation is available immediately after the
 *  script tag.  The module self-initialises on DOMContentLoaded.
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */
  const ROTATION_TRANSITION_MS  = 380;   // matches CSS transition duration
  const ORIENTATION_DEBOUNCE_MS = 120;   // debounce orientationchange events
  const KEYBOARD_HEIGHT_THRESH  = 140;   // px shrink that indicates soft keyboard
  const CHART_RESIZE_DELAY_MS   = 180;   // wait for CSS repaint before resizing charts
  const TAB_RERENDER_DELAY_MS   = 80;    // delay tab re-render after rotation

  /* ── State ──────────────────────────────────────────── */
  let _lastVH             = 0;
  let _lastOrientation    = null;   // 'portrait' | 'landscape'
  let _isKeyboardOpen     = false;
  let _debounceTimer      = null;
  let _rotatingTimer      = null;
  let _initialVVHeight    = 0;      // captured on first load

  /* ══════════════════════════════════════════════════════
     CORE API — window.OasisOrientation
  ══════════════════════════════════════════════════════ */
  window.OasisOrientation = {

    /** Called once by DOMContentLoaded handler below */
    init: function () {
      _initialVVHeight = _getViewportHeight();
      _lastOrientation = _currentOrientation();

      this.updateVH();
      this._updateSafeAreaVars();
      this._applyOrientationClass();
      this._bindEvents();
      this._tryPWAOrientationLock();

      /* Restore user's landscape preference if they enabled it before */
      try {
        if (localStorage.getItem('oasis_landscape') === '1') {
          this.enableLandscape();
        }
      } catch(e) {}

      console.log('[OasisOrientation] Initialised —', _lastOrientation);
    },

    /* ── Public helpers ───────────────────────────────── */

    /** Recalculate and apply the --vh CSS variable */
    updateVH: function () {
      var h = _getViewportHeight();
      if (h === _lastVH) return;
      _lastVH = h;
      var vh = h * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    },

    /** Returns 'portrait' or 'landscape' */
    currentOrientation: function () {
      return _currentOrientation();
    },

    /** True while soft keyboard is likely open */
    isKeyboardOpen: function () {
      return _isKeyboardOpen;
    },

    /* ── Internal ─────────────────────────────────────── */

    _bindEvents: function () {
      /* visualViewport — keyboard + pan-zoom aware resize */
      if (window.visualViewport) {
        var vv = window.visualViewport;
        vv.addEventListener('resize',  _onViewportResize);
        vv.addEventListener('scroll',  _onViewportScroll);
      } else {
        /* Fallback for browsers without visualViewport */
        window.addEventListener('resize', _onWindowResize);
      }

      /* Orientation change — modern + legacy */
      if (window.screen && screen.orientation) {
        screen.orientation.addEventListener('change', _onOrientationChange);
      }
      window.addEventListener('orientationchange', _onOrientationChange);

      /* Also catch resize-based orientation changes (desktop/tablet) */
      window.addEventListener('resize', _onWindowResize);
    },

    _updateSafeAreaVars: function () {
      /* Read CSS env() safe-area insets via a probe element */
      var probe = document.createElement('div');
      probe.style.cssText = [
        'position:fixed',
        'top:env(safe-area-inset-top,0px)',
        'bottom:env(safe-area-inset-bottom,0px)',
        'left:env(safe-area-inset-left,0px)',
        'right:env(safe-area-inset-right,0px)',
        'width:0', 'height:0',
        'pointer-events:none', 'visibility:hidden'
      ].join(';');
      document.body.appendChild(probe);

      var cs = window.getComputedStyle(probe);
      document.documentElement.style.setProperty('--sai-top',    cs.top    || '0px');
      document.documentElement.style.setProperty('--sai-bottom', cs.bottom || '0px');
      document.documentElement.style.setProperty('--sai-left',   cs.left   || '0px');
      document.documentElement.style.setProperty('--sai-right',  cs.right  || '0px');

      document.body.removeChild(probe);
    },

    _applyOrientationClass: function () {
      var orientation = _currentOrientation();
      document.body.classList.toggle('is-portrait',  orientation === 'portrait');
      document.body.classList.toggle('is-landscape', orientation === 'landscape');
    },

    _tryPWAOrientationLock: function () {
      /*
       * The Web Platform has NO API to read the device's auto-rotate
       * system setting. The probe approach (lock landscape, see if it
       * resolves) does NOT work — screen.orientation.lock() resolves
       * based on API permission, not on whether the OS actually allows
       * rotation. It resolves even when auto-rotate is OFF, so the
       * probe always triggers unlock(), which undoes everything.
       *
       * Correct strategy:
       *   • Manifest  orientation:'portrait'  is the declaration of
       *     intent. Android respects this at install time.
       *   • JS lock('portrait') reinforces it at runtime for cases
       *     where the manifest cache is stale.
       *   • We never call unlock() programmatically. If the user
       *     wants landscape they use the Settings toggle (which calls
       *     OasisOrientation.enableLandscape()).
       *   • In a browser tab lock() rejects (needs standalone) —
       *     the catch swallows it silently, correct behaviour.
       */
      if (!window.screen || !screen.orientation || !screen.orientation.lock) return;

      var isStandalone = (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.navigator.standalone === true
      );

      if (!isStandalone) return;

      screen.orientation.lock('portrait').then(function () {
        console.log('[OasisOrientation] Portrait lock active (PWA standalone)');
      }).catch(function (err) {
        /* Browser tab or unsupported — silent, nothing to do */
        console.log('[OasisOrientation] Lock skipped:', err && err.message);
      });
    },

    /**
     * Call this from a Settings toggle to permit landscape rotation.
     * Calls unlock() so the OS auto-rotate setting governs normally.
     * Persist the user's choice in localStorage so it survives reload.
     */
    enableLandscape: function () {
      if (window.screen && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
      try { localStorage.setItem('oasis_landscape', '1'); } catch(e) {}
      console.log('[OasisOrientation] Landscape enabled by user');
    },

    /** Re-apply portrait lock (call from Settings toggle off) */
    disableLandscape: function () {
      if (window.screen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(function(){});
      }
      try { localStorage.removeItem('oasis_landscape'); } catch(e) {}
      console.log('[OasisOrientation] Landscape disabled — portrait lock restored');
    },

    /** Force a full recalculation (charts + tab re-render) */
    forceRecalc: function () {
      _performRecalculation(true);
    }
  };

  /* ══════════════════════════════════════════════════════
     PRIVATE HELPERS
  ══════════════════════════════════════════════════════ */

  function _getViewportHeight() {
    if (window.visualViewport) return window.visualViewport.height;
    return window.innerHeight;
  }

  function _currentOrientation() {
    if (window.matchMedia) {
      return window.matchMedia('(orientation: landscape)').matches
        ? 'landscape'
        : 'portrait';
    }
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  function _isRealOrientationChange() {
    var current = _currentOrientation();
    return current !== _lastOrientation;
  }

  /* ── Event handlers ───────────────────────────────── */

  function _onViewportResize() {
    if (!window.visualViewport) return;

    var currentH = window.visualViewport.height;
    var diff     = _initialVVHeight - currentH;

    /*
     * If the viewport shrank by more than the threshold AND the
     * orientation hasn't changed, we're probably looking at a
     * soft keyboard open.  We suppress orientation recalc but
     * still update --vh so the layout shrinks correctly.
     */
    var orientationActuallyChanged = _isRealOrientationChange();

    if (!orientationActuallyChanged && diff > KEYBOARD_HEIGHT_THRESH) {
      _isKeyboardOpen = true;
      /* Update --vh to reflect the reduced visible area */
      var vh = currentH * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
      return;
    }

    /* Keyboard closed or not involved */
    if (_isKeyboardOpen && !orientationActuallyChanged && diff <= KEYBOARD_HEIGHT_THRESH) {
      _isKeyboardOpen = false;
      _initialVVHeight = currentH;
    }

    window.OasisOrientation.updateVH();

    if (orientationActuallyChanged) {
      _scheduleOrientationHandler();
    }
  }

  function _onViewportScroll() {
    /* Pan-zoom or browser-chrome scroll — just update --vh */
    window.OasisOrientation.updateVH();
  }

  function _onWindowResize() {
    if (_isKeyboardOpen) return;
    window.OasisOrientation.updateVH();

    if (_isRealOrientationChange()) {
      _scheduleOrientationHandler();
    }
  }

  function _onOrientationChange() {
    /* iOS fires orientationchange before the dimensions update.
       A 100ms delay ensures window.innerWidth/Height are correct. */
    _scheduleOrientationHandler();
  }

  /* ── Debounced orientation change pipeline ──────── */

  function _scheduleOrientationHandler() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_handleOrientationChange, ORIENTATION_DEBOUNCE_MS);
  }

  function _handleOrientationChange() {
    var newOrientation = _currentOrientation();

    if (newOrientation === _lastOrientation) return; // no real change

    _lastOrientation = newOrientation;

    /* ① Update CSS variables */
    window.OasisOrientation.updateVH();
    window.OasisOrientation._updateSafeAreaVars();

    /* ② Apply body orientation classes */
    window.OasisOrientation._applyOrientationClass();

    /* ③ Temporarily add .rotating to enable CSS transitions */
    _triggerRotatingClass();

    /* ④ Dispatch custom event for app-level listeners */
    var evt = new CustomEvent('oasis:orientation', {
      bubbles: true,
      detail:  { orientation: newOrientation }
    });
    document.dispatchEvent(evt);

    /* ⑤ Recalculate UI */
    _performRecalculation(false);

    console.log('[OasisOrientation] Changed →', newOrientation);
  }

  function _triggerRotatingClass() {
    clearTimeout(_rotatingTimer);
    document.body.classList.add('rotating');
    _rotatingTimer = setTimeout(function () {
      document.body.classList.remove('rotating');
    }, ROTATION_TRANSITION_MS);
  }

  /* ── Post-rotation recalculation ──────────────────── */

  function _performRecalculation(immediate) {
    var delay = immediate ? 0 : TAB_RERENDER_DELAY_MS;

    setTimeout(function () {
      _recalcActiveTab();
    }, delay);

    setTimeout(function () {
      _resizeCharts();
      _fixModals();
      _scrollActiveNavItem();
    }, immediate ? 0 : CHART_RESIZE_DELAY_MS);
  }

  function _recalcActiveTab() {
    /* Re-render the currently visible tab so its charts and
       tables get correct dimensions after rotation. */
    if (typeof window.switchTab !== 'function') return;

    var activePane = document.querySelector('.tab-pane.active');
    if (!activePane) return;

    var tabId = activePane.id.replace(/^tab-/, '');
    if (!tabId) return;

    window.switchTab(tabId);
  }

  function _resizeCharts() {
    /* window._charts is set by app.js via:
         window._charts = _charts;
       If it isn't set yet, fall back to Chart.js's global registry. */
    var charts = window._charts;

    if (charts) {
      Object.keys(charts).forEach(function (id) {
        try {
          if (charts[id] && typeof charts[id].resize === 'function') {
            charts[id].resize();
          }
        } catch (e) { /* ignore stale chart references */ }
      });
      return;
    }

    /* Fallback: resize every registered Chart.js instance */
    if (window.Chart && Chart.instances) {
      Object.values(Chart.instances).forEach(function (chart) {
        try { chart.resize(); } catch (e) {}
      });
    }
  }

  function _fixModals() {
    /* Re-measure any visible overlay / modal so max-height is
       recalculated after the viewport changes. */
    var overlays = document.querySelectorAll(
      '.urm-modal-overlay, .pwa-install-overlay, .dev-crop-overlay, [style*="position: fixed"]'
    );
    overlays.forEach(function (el) {
      if (el.offsetParent === null) return; // hidden
      /* Trigger a CSS reflow by toggling a benign property */
      var old = el.style.transform || '';
      el.style.transform = 'translateZ(0)';
      void el.offsetHeight;
      el.style.transform = old;
    });
  }

  function _scrollActiveNavItem() {
    /* Ensure the active bottom-nav or sidebar-nav item is visible */
    var active = document.querySelector('.btn-item.active, .nav-item.active');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /* ══════════════════════════════════════════════════════
     SELF-INIT
  ══════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.OasisOrientation.init();
    });
  } else {
    window.OasisOrientation.init();
  }

})();
