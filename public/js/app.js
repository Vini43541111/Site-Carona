/**
 * CaronaUni — Funções compartilhadas
 */

/* ───── CONFIGURAÇÃO DO MAPA ───── */

/** Campus Unoesc Chapecó — destino padrão das caronas */
const CAMPUS_UNOESC = [-27.1344867, -52.5993719];
const CAMPUS_NOME   = 'Campus Unoesc – Portaria Principal';

/** Centro inicial do mapa: o campus, já que é o destino da maioria das caronas */
const MAP_CENTER = CAMPUS_UNOESC;
const MAP_ZOOM   = 14;

/** Ícone de pino colorido para Leaflet */
function createPinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/* ───── GEOCODIFICAÇÃO (Nominatim) ─────
   A política de uso pede no máximo 1 requisição por segundo. Arrastar um pino
   dispara muitos eventos, então tudo passa por uma fila com intervalo mínimo. */
const NOMINATIM_INTERVALO_MS = 1100;
let _ultimaChamadaNominatim = 0;

async function _chamarNominatim(url) {
  const espera = Math.max(0, NOMINATIM_INTERVALO_MS - (Date.now() - _ultimaChamadaNominatim));
  if (espera) await new Promise(r => setTimeout(r, espera));
  _ultimaChamadaNominatim = Date.now();

  const res = await fetch(url);
  if (!res.ok) throw new Error('Nominatim indisponível');
  return res.json();
}

/** Geocodificação reversa: lat/lng → endereço. Só a última chamada vale. */
let _tokenReverse = 0;
async function reverseGeocode(lat, lng, inputId, previewId) {
  const meuToken = ++_tokenReverse;
  try {
    const data = await _chamarNominatim(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    // enquanto esperava, o usuário mexeu de novo: descarta este resultado
    if (meuToken !== _tokenReverse) return;

    const addr = (data.display_name || '').split(',').slice(0, 2).join(',').trim();
    if (!addr) return;
    if (inputId)   document.getElementById(inputId).value        = addr;
    if (previewId) document.getElementById(previewId).textContent = addr;
  } catch (_) { /* silencia: o pino continua válido mesmo sem o endereço */ }
}

/** Geocodificação direta: endereço → [lat, lng], ou null */
async function geocodeEndereco(consulta) {
  if (!consulta || !consulta.trim()) return null;
  try {
    const data = await _chamarNominatim(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`
    );
    if (!data.length) return null;
    return [Number(data[0].lat), Number(data[0].lon)];
  } catch (_) {
    return null;
  }
}

/* ───── ROTA REAL (OSRM) ───── */

/**
 * Traça a rota pelas ruas entre dois pontos.
 * @returns {Promise<{coords: Array, distanciaKm: number, duracaoMin: number}|null>}
 *          null quando o serviço falha — quem chama desenha a linha reta.
 */
async function calcularRota(origem, destino) {
  const url = `https://router.project-osrm.org/route/v1/driving/`
    + `${origem[1]},${origem[0]};${destino[1]},${destino[0]}`
    + `?overview=full&geometries=geojson`;

  try {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 6000); // não trava a tela
    const res = await fetch(url, { signal: controle.signal });
    clearTimeout(limite);

    if (!res.ok) return null;
    const data = await res.json();
    const rota = data.routes && data.routes[0];
    if (!rota) return null;

    return {
      coords: rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanciaKm: Number((rota.distance / 1000).toFixed(2)),
      duracaoMin: Math.round(rota.duration / 60),
    };
  } catch (_) {
    return null;
  }
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
