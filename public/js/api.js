/**
 * CaronaUni — Cliente HTTP e sessão
 */

const API_BASE = '/api';

async function api(metodo, rota, corpo) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_BASE + rota, {
    method: metodo,
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });

  const texto = await res.text();
  let d = {};
  try { d = texto ? JSON.parse(texto) : {}; } catch { d = {}; }

  // token expirado ou inválido: não adianta mostrar toast numa tela quebrada
  if (res.status === 401 && getToken()) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'index.html?expirou=1';
    throw new Error(d.erro || 'Sessão expirada');
  }

  if (!res.ok) throw new Error(d.erro || 'Erro na requisição');
  return d;
}

function salvarSessao(token, usuario) {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

function getUsuario() {
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) : null;
}

function getToken() {
  return localStorage.getItem('token');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
}

function exigirLogin() {
  if (!getToken()) {
    window.location.href = 'index.html';
    return;
  }
  preencherHeaderUsuario();
}

/** Preenche o avatar e o nome no header com o usuário logado */
function preencherHeaderUsuario() {
  const usuario = getUsuario();
  if (!usuario) return;

  const avatarEl = document.querySelector('.header-user .avatar');
  const nomeEl   = document.querySelector('.header-user span');
  if (avatarEl) avatarEl.textContent = iniciais(usuario.nome).charAt(0);
  if (nomeEl)   nomeEl.textContent   = `Olá, ${usuario.nome.split(' ')[0]} ▾`;

  montarMenuMobile();
}

/** Abaixo de 768px o .header-nav some no CSS — este botão abre o mesmo menu */
function montarMenuMobile() {
  const header = document.querySelector('.header');
  const nav    = document.querySelector('.header-nav');
  if (!header || !nav || document.getElementById('menu-mobile-btn')) return;

  const botao = document.createElement('button');
  botao.id = 'menu-mobile-btn';
  botao.className = 'menu-mobile-btn';
  botao.setAttribute('aria-label', 'Abrir menu');
  botao.textContent = '☰';
  botao.onclick = () => nav.classList.toggle('aberto');
  header.insertBefore(botao, header.firstChild);

  // fecha ao escolher um destino
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('aberto')));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function iniciais(nome) {
  return (nome || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}
