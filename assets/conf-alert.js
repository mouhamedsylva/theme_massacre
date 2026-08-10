/**
 * conf-alert.js — Modales & toasts modernes (style SweetAlert), sans dépendance.
 *
 * API (toutes globales, sur window) :
 *   confAlert(message, opts?)   -> Promise<void>            (remplace alert)
 *   confConfirm(message, opts?) -> Promise<boolean>         (remplace confirm)
 *   confPrompt(message, opts?)  -> Promise<string|null>     (remplace prompt)
 *   confToast(message, opts?)   -> void                     (notification brève)
 *
 * opts communs : { title, icon: 'success'|'error'|'warning'|'info'|'question',
 *                  confirmText, cancelText, defaultValue (prompt), type (toast) }
 */
(function () {
  if (window.confAlert) return; // évite double injection

  // ── Styles (injectés une fois) ────────────────────────────────────────────
  var CSS = ''
    + '.ca-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(20,20,25,.55);backdrop-filter:blur(2px);opacity:0;transition:opacity .18s ease;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:20px;}'
    + '.ca-overlay.ca-show{opacity:1;}'
    + '.ca-box{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:28px 26px 22px;'
    + 'box-shadow:0 24px 60px rgba(0,0,0,.28);text-align:center;transform:scale(.92) translateY(6px);'
    + 'transition:transform .2s cubic-bezier(.34,1.56,.64,1);}'
    + '.ca-overlay.ca-show .ca-box{transform:scale(1) translateY(0);}'
    + '.ca-icon{width:64px;height:64px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;'
    + 'justify-content:center;}'
    + '.ca-icon svg{width:34px;height:34px;}'
    + '.ca-icon.success{background:#e7f8ee;color:#16a34a;}'
    + '.ca-icon.error{background:#fdeaea;color:#dc2626;}'
    + '.ca-icon.warning{background:#fef4e6;color:#e8842a;}'
    + '.ca-icon.info{background:#e8f1fd;color:#2563eb;}'
    + '.ca-icon.question{background:#f0edfb;color:#7c3aed;}'
    + '.ca-title{font-size:19px;font-weight:800;color:#1a1a1a;margin-bottom:8px;line-height:1.25;}'
    + '.ca-msg{font-size:14px;color:#555;line-height:1.5;white-space:pre-line;margin-bottom:22px;}'
    + '.ca-input{width:100%;padding:11px 13px;border:1.5px solid #e2e2e2;border-radius:9px;font-size:14px;'
    + 'font-family:inherit;margin-bottom:22px;outline:none;transition:border-color .15s;}'
    + '.ca-input:focus{border-color:#1a1a1a;}'
    + '.ca-actions{display:flex;gap:10px;justify-content:center;}'
    + '.ca-btn{flex:1;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;'
    + 'border:none;font-family:inherit;transition:transform .1s ease,filter .15s ease,background .15s;}'
    + '.ca-btn:active{transform:scale(.97);}'
    + '.ca-btn-confirm{background:#1a1a1a;color:#fff;}'
    + '.ca-btn-confirm:hover{background:#333;}'
    + '.ca-btn-cancel{background:#f0f0f0;color:#333;}'
    + '.ca-btn-cancel:hover{background:#e4e4e4;}'
    // Toasts
    + '.ca-toast-wrap{position:fixed;top:18px;right:18px;z-index:2147483001;display:flex;flex-direction:column;'
    + 'gap:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none;}'
    + '.ca-toast{display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:13px 16px;'
    + 'box-shadow:0 10px 30px rgba(0,0,0,.16);min-width:240px;max-width:360px;transform:translateX(120%);'
    + 'transition:transform .28s cubic-bezier(.34,1.3,.64,1),opacity .2s;border-left:4px solid #999;}'
    + '.ca-toast.ca-show{transform:translateX(0);}'
    + '.ca-toast .ca-toast-ic{flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;}'
    + '.ca-toast .ca-toast-txt{font-size:13.5px;color:#222;line-height:1.35;white-space:pre-line;}'
    + '.ca-toast.success{border-left-color:#16a34a;} .ca-toast.success .ca-toast-ic{color:#16a34a;}'
    + '.ca-toast.error{border-left-color:#dc2626;} .ca-toast.error .ca-toast-ic{color:#dc2626;}'
    + '.ca-toast.warning{border-left-color:#e8842a;} .ca-toast.warning .ca-toast-ic{color:#e8842a;}'
    + '.ca-toast.info{border-left-color:#2563eb;} .ca-toast.info .ca-toast-ic{color:#2563eb;}';

  var style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  // ── Icônes SVG ─────────────────────────────────────────────────────────────
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    question:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Modale générique ───────────────────────────────────────────────────────
  // kind: 'alert' | 'confirm' | 'prompt'
  function openModal(kind, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var icon = opts.icon || (kind === 'confirm' ? 'question' : kind === 'prompt' ? 'question' : 'info');
      var confirmText = opts.confirmText || (kind === 'confirm' ? 'Confirmer' : 'OK');
      var cancelText = opts.cancelText || 'Annuler';

      var overlay = document.createElement('div');
      overlay.className = 'ca-overlay';

      var inputHtml = kind === 'prompt'
        ? '<input class="ca-input" type="text" value="' + esc(opts.defaultValue || '') + '">'
        : '';

      var cancelBtn = (kind === 'confirm' || kind === 'prompt')
        ? '<button type="button" class="ca-btn ca-btn-cancel" data-act="cancel">' + esc(cancelText) + '</button>'
        : '';

      overlay.innerHTML =
        '<div class="ca-box" role="dialog" aria-modal="true">' +
          (opts.title || icon ? '<div class="ca-icon ' + icon + '">' + (ICONS[icon] || '') + '</div>' : '') +
          (opts.title ? '<div class="ca-title">' + esc(opts.title) + '</div>' : '') +
          '<div class="ca-msg">' + esc(message) + '</div>' +
          inputHtml +
          '<div class="ca-actions">' + cancelBtn +
            '<button type="button" class="ca-btn ca-btn-confirm" data-act="confirm">' + esc(confirmText) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      // eslint-disable-next-line no-unused-expressions
      overlay.offsetWidth; // reflow pour l'anim
      overlay.classList.add('ca-show');

      var input = overlay.querySelector('.ca-input');
      if (input) { input.focus(); input.select(); }

      function close(result) {
        overlay.classList.remove('ca-show');
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
        resolve(result);
      }

      overlay.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'confirm') {
          if (kind === 'prompt') close(input ? input.value : '');
          else if (kind === 'confirm') close(true);
          else close();
        } else if (act === 'cancel') {
          close(kind === 'prompt' ? null : false);
        } else if (e.target === overlay && kind === 'alert') {
          close(); // clic hors boîte ferme une simple alerte
        }
      });

      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          if (kind === 'prompt') close(input ? input.value : '');
          else if (kind === 'confirm') close(true);
          else close();
        } else if (e.key === 'Escape') {
          close(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined);
        }
      });
      // rend l'overlay focusable pour capter Échap
      overlay.tabIndex = -1;
      if (!input) overlay.focus();
    });
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(message, opts) {
    opts = opts || {};
    var type = opts.type || 'info';
    var wrap = document.querySelector('.ca-toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'ca-toast-wrap'; document.body.appendChild(wrap); }
    var el = document.createElement('div');
    el.className = 'ca-toast ' + type;
    el.style.pointerEvents = 'auto';
    el.innerHTML = '<span class="ca-toast-ic">' + (ICONS[type] || ICONS.info) + '</span>' +
                   '<span class="ca-toast-txt">' + esc(message) + '</span>';
    wrap.appendChild(el);
    el.offsetWidth; // reflow
    el.classList.add('ca-show');
    var dur = opts.duration || 3200;
    setTimeout(function () {
      el.classList.remove('ca-show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, dur);
  }

  // ── Expose ─────────────────────────────────────────────────────────────────
  window.confAlert   = function (msg, o) { return openModal('alert', msg, o); };
  window.confConfirm = function (msg, o) { return openModal('confirm', msg, o); };
  window.confPrompt  = function (msg, o) { return openModal('prompt', msg, o); };
  window.confToast   = toast;
})();
