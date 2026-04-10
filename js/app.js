/**
 * CaronaUni — Funções compartilhadas
 */

/* ───── CONFIGURAÇÃO DO MAPA ───── */
const MAP_CENTER = [-27.0954, -52.6150]; // Unoesc Chapecó
const MAP_ZOOM   = 13;

/** Ícone de pino colorido para Leaflet */
function createPinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/** Geocodificação reversa via Nominatim */
async function reverseGeocode(lat, lng, inputId, previewId) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    const addr = data.display_name.split(',').slice(0, 2).join(',').trim();
    if (inputId)   document.getElementById(inputId).value       = addr;
    if (previewId) document.getElementById(previewId).textContent = addr;
  } catch (_) { /* silencia erros de rede */ }
}

/** Geolocalização do dispositivo */
function usarLocalizacao(callback) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => callback(pos.coords.latitude, pos.coords.longitude),
    ()  => showToast('Não foi possível obter sua localização.', 'warning'),
  );
}

/* ───── MODAIS ───── */

/** Abre modal pelo id */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

/** Fecha modal pelo id */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/** Fecha modal ao clicar fora (overlay) */
function initModalClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ───── TABS ───── */

/**
 * Alterna aba ativa
 * @param {string} name - sufixo do id do painel (tab-{name})
 * @param {Element} el  - elemento .tab clicado
 */
function showTab(name, el) {
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  document.getElementById('tab-' + name).style.display = 'block';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

/* ───── TOAST / FEEDBACK ───── */

/**
 * Exibe mensagem flutuante temporária
 * @param {string} msg   - texto da mensagem
 * @param {string} type  - 'success' | 'warning' | 'info'
 */
function showToast(msg, type = 'info') {
  const colors = { success: '#2e7d32', warning: '#e65100', info: '#1565c0' };
  const toast  = document.createElement('div');
  toast.textContent = msg;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '1.5rem',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   colors[type] || colors.info,
    color:        '#fff',
    padding:      '.65rem 1.4rem',
    borderRadius: '8px',
    fontSize:     '.9rem',
    fontWeight:   '600',
    zIndex:       '9999',
    boxShadow:    '0 4px 16px rgba(0,0,0,.2)',
    transition:   'opacity .3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  setTimeout(() => { toast.remove(); }, 2900);
}

/* ───── DATA ATUAL ───── */

/** Retorna data/hora atual no formato aceito por input[datetime-local] */
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Retorna data atual no formato aceito por input[date] */
function todayDateISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* ───── INICIALIZAÇÃO COMUM ───── */
document.addEventListener('DOMContentLoaded', () => {
  initModalClose();
});
