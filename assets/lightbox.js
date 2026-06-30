/* tapdot lightbox — scroll/pinch to zoom, drag to pan, Esc to close */
(function(){
'use strict';

/* ── inject CSS ─────────────────────────────────────── */
var style = document.createElement('style');
style.textContent = [
  'img[data-lightbox]{cursor:zoom-in}',
  '.lbx{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);',
    'display:flex;align-items:center;justify-content:center;',
    'opacity:0;pointer-events:none;transition:opacity .18s ease;',
    'touch-action:none}',
  '.lbx.open{opacity:1;pointer-events:all}',
  '.lbx-inner{position:relative;will-change:transform;touch-action:none}',
  '.lbx-inner.zoomed{cursor:grab}',
  '.lbx-inner.dragging{cursor:grabbing}',
  '.lbx img{display:block;max-width:94vw;max-height:90vh;border-radius:10px;',
    'user-select:none;pointer-events:none;-webkit-user-drag:none;',
    'box-shadow:0 32px 80px rgba(0,0,0,.6)}',
  '.lbx-x{position:fixed;top:18px;right:20px;width:38px;height:38px;',
    'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24);',
    'border-radius:50%;display:flex;align-items:center;justify-content:center;',
    'cursor:pointer;color:#fff;font-size:22px;line-height:1;z-index:10000;',
    'font-family:system-ui,sans-serif;transition:background .14s;padding:0}',
  '.lbx-x:hover{background:rgba(255,255,255,.26)}',
  '.lbx-hint{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);',
    'color:rgba(255,255,255,.36);font-size:11.5px;font-family:system-ui,sans-serif;',
    'letter-spacing:.01em;white-space:nowrap;pointer-events:none;z-index:10000}'
].join('');
document.head.appendChild(style);

/* ── state ──────────────────────────────────────────── */
var overlay, inner, imgEl;
var scale = 1, panX = 0, panY = 0;
var dragging = false, hasMoved = false;
var startX, startY, basePanX, basePanY;
var pinch0 = null; // {dist, scale, panX, panY, midX, midY}
var MAX_SCALE = 5;

/* ── build DOM (lazy) ───────────────────────────────── */
function build(){
  overlay = document.createElement('div');
  overlay.className = 'lbx';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');

  var xBtn = document.createElement('button');
  xBtn.className = 'lbx-x';
  xBtn.setAttribute('aria-label','Close');
  xBtn.innerHTML = '&#xd7;';
  xBtn.addEventListener('click', function(e){ e.stopPropagation(); closeLbx(); });

  inner = document.createElement('div');
  inner.className = 'lbx-inner';

  imgEl = document.createElement('img');
  inner.appendChild(imgEl);

  var hint = document.createElement('div');
  hint.className = 'lbx-hint';
  hint.textContent = 'Scroll or pinch to zoom · drag to pan · Esc to close';

  overlay.appendChild(xBtn);
  overlay.appendChild(inner);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeLbx(); });
  overlay.addEventListener('wheel', onWheel, {passive:false});
  inner.addEventListener('mousedown', onMD);
  document.addEventListener('mousemove', onMM);
  document.addEventListener('mouseup', onMU);
  overlay.addEventListener('touchstart', onTS, {passive:false});
  overlay.addEventListener('touchmove', onTM, {passive:false});
  overlay.addEventListener('touchend', onTE);
  document.addEventListener('keydown', onKey);
}

/* ── transform helpers ──────────────────────────────── */
function applyT(smooth){
  inner.style.transition = smooth ? 'transform .18s ease-out' : 'none';
  inner.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+scale+')';
  inner.classList.toggle('zoomed', scale > 1.05);
}

function clampPan(){
  var mxp = Math.max(0, (imgEl.offsetWidth  * scale - window.innerWidth  * 0.94) / 2);
  var myp = Math.max(0, (imgEl.offsetHeight * scale - window.innerHeight * 0.90) / 2);
  panX = Math.max(-mxp, Math.min(mxp, panX));
  panY = Math.max(-myp, Math.min(myp, panY));
}

function resetZoom(smooth){
  scale = 1; panX = 0; panY = 0; applyT(smooth);
}

/* ── open / close ───────────────────────────────────── */
function openLbx(src, alt){
  if (!overlay) build();
  imgEl.src = src;
  imgEl.alt = alt || '';
  resetZoom(false);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLbx(){
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── scroll wheel zoom (toward cursor) ─────────────── */
function onWheel(e){
  e.preventDefault();
  var factor = e.deltaY < 0 ? 1.22 : 1/1.22;
  var ns = Math.max(1, Math.min(MAX_SCALE, scale * factor));
  if (ns === scale) return;
  var r = inner.getBoundingClientRect();
  var cx = (e.clientX - (r.left + r.width/2))  / scale;
  var cy = (e.clientY - (r.top  + r.height/2)) / scale;
  panX -= cx * (ns - scale);
  panY -= cy * (ns - scale);
  scale = ns;
  if (scale <= 1.02){ scale=1; panX=0; panY=0; }
  else clampPan();
  applyT(false);
}

/* ── mouse drag ─────────────────────────────────────── */
function onMD(e){
  if (scale <= 1) return;
  dragging=true; hasMoved=false;
  startX=e.clientX; startY=e.clientY;
  basePanX=panX; basePanY=panY;
  inner.classList.add('dragging');
  e.preventDefault();
}
function onMM(e){
  if (!dragging) return;
  panX = basePanX + (e.clientX - startX);
  panY = basePanY + (e.clientY - startY);
  clampPan(); applyT(false); hasMoved=true;
}
function onMU(){ dragging=false; inner.classList.remove('dragging'); }

/* ── touch pinch + single-finger pan ───────────────── */
function midDist(t){
  var dx=t[1].clientX-t[0].clientX, dy=t[1].clientY-t[0].clientY;
  return {
    mx:(t[0].clientX+t[1].clientX)/2,
    my:(t[0].clientY+t[1].clientY)/2,
    d:Math.sqrt(dx*dx+dy*dy)
  };
}
function onTS(e){
  e.preventDefault();
  hasMoved=false;
  if(e.touches.length===2){
    var m=midDist(e.touches);
    pinch0={dist:m.d,scale:scale,panX:panX,panY:panY,midX:m.mx,midY:m.my};
  } else if(e.touches.length===1){
    startX=e.touches[0].clientX; startY=e.touches[0].clientY;
    basePanX=panX; basePanY=panY;
  }
}
function onTM(e){
  e.preventDefault();
  if(e.touches.length===2 && pinch0){
    var m=midDist(e.touches);
    scale=Math.max(1,Math.min(MAX_SCALE,pinch0.scale*(m.d/pinch0.dist)));
    panX=pinch0.panX+(m.mx-pinch0.midX);
    panY=pinch0.panY+(m.my-pinch0.midY);
    clampPan(); applyT(false); hasMoved=true;
  } else if(e.touches.length===1 && scale>1){
    panX=basePanX+(e.touches[0].clientX-startX);
    panY=basePanY+(e.touches[0].clientY-startY);
    clampPan(); applyT(false); hasMoved=true;
  }
}
function onTE(e){
  if(e.touches.length<2) pinch0=null;
  if(e.touches.length===0){
    if(scale<1.05) resetZoom(true);
    if(!hasMoved) closeLbx(); // tap to close when not zoomed / not panning
  }
}

/* ── keyboard ───────────────────────────────────────── */
function onKey(e){
  if(!overlay||!overlay.classList.contains('open')) return;
  if(e.key==='Escape') closeLbx();
  if(e.key==='+'||e.key==='='){ scale=Math.min(MAX_SCALE,scale*1.3); clampPan(); applyT(true); }
  if(e.key==='-'){ scale=Math.max(1,scale/1.3); if(scale<=1.02){resetZoom(true);return;} clampPan(); applyT(true); }
  if(e.key==='0'){ resetZoom(true); }
}

/* ── event delegation (works for dynamic images) ────── */
document.addEventListener('click', function(e){
  var el = e.target;
  if(el.tagName==='IMG' && el.hasAttribute('data-lightbox')){
    openLbx(el.src, el.alt);
  }
});

window.LBX = {open:openLbx, close:closeLbx};
})();
