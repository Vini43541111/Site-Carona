require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Usuario, Veiculo, Carona, Solicitacao, Avaliacao } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

// sem segredo não sobe: um fallback hardcoded deixaria qualquer um forjar token
if (!SECRET) {
  console.error('JWT_SECRET não definido. Copie .env.example para .env e defina um valor.');
  process.exit(1);
}

// o Postgres tem ILIKE (case-insensitive); o SQLite já compara sem case no LIKE
const OP_CONTEM = (process.env.DB_DIALECT || 'postgres') === 'sqlite' ? Op.like : Op.iLike;

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ───── helpers ───── */
const semSenha = (u) => {
  if (!u) return null;
  const o = u.toJSON ? u.toJSON() : u;
  delete o.senha_hash;
  return o;
};

/** Erro que vira resposta HTTP — qualquer outro erro sai como 500 genérico */
class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Embrulha rota async: erro cai no handler central em vez de virar stack trace */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Converte "12" em 12; recusa qualquer coisa que não seja id inteiro positivo */
function idNumerico(valor, nome = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new ErroApi(400, `${nome} inválido`);
  return n;
}

/** Só aceita string de verdade, aparada e dentro do limite da coluna */
function texto(valor, { campo, obrigatorio = false, max = 255 }) {
  if (valor === undefined || valor === null) {
    if (obrigatorio) throw new ErroApi(400, `${campo} é obrigatório`);
    return undefined;
  }
  if (typeof valor !== 'string') throw new ErroApi(400, `${campo} deve ser texto`);
  const limpo = valor.trim();
  if (obrigatorio && !limpo) throw new ErroApi(400, `${campo} é obrigatório`);
  if (limpo.length > max) throw new ErroApi(400, `${campo} deve ter no máximo ${max} caracteres`);
  return limpo;
}

function booleano(valor, padrao) {
  if (valor === undefined) return padrao;
  if (typeof valor !== 'boolean') throw new ErroApi(400, 'valor booleano inválido');
  return valor;
}

/** Latitude/longitude opcional; `limite` é 90 para lat e 180 para lng */
function coordenada(valor, campo, limite) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || Math.abs(n) > limite) throw new ErroApi(400, `${campo} inválida`);
  return n;
}

function numeroOpcional(valor, campo, min, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw new ErroApi(400, `${campo} inválido`);
  return n;
}

function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ErroApi(401, 'Token ausente');
  try {
    req.usuario = jwt.verify(token, SECRET);
  } catch {
    throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
  }
  next();
}

/* ───── AUTH / USUARIO (RF-P1) ───── */
app.post('/api/usuarios', rota(async (req, res) => {
  const nome      = texto(req.body.nome,      { campo: 'nome', obrigatorio: true, max: 120 });
  const email     = texto(req.body.email,     { campo: 'email', obrigatorio: true, max: 150 });
  const matricula = texto(req.body.matricula, { campo: 'matrícula', obrigatorio: true, max: 20 });
  const curso     = texto(req.body.curso,     { campo: 'curso', max: 120 });
  const telefone  = texto(req.body.telefone,  { campo: 'telefone', max: 20 });

  const senha = req.body.senha;
  if (typeof senha !== 'string' || senha.length < 6)
    throw new ErroApi(400, 'senha deve ter ao menos 6 caracteres');

  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    const usuario = await Usuario.create({ nome, email, matricula, senha_hash, curso, telefone });
    res.status(201).json(semSenha(usuario));
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError')
      throw new ErroApi(409, 'E-mail ou matrícula já cadastrados');
    if (e.name === 'SequelizeValidationError')
      throw new ErroApi(400, e.errors.map(x => x.message).join('; '));
    throw e;
  }
}));

app.post('/api/login', rota(async (req, res) => {
  const { email, senha } = req.body;
  if (typeof email !== 'string' || typeof senha !== 'string')
    throw new ErroApi(401, 'Credenciais inválidas');

  const usuario = await Usuario.findOne({ where: { email } });
  if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash)))
    throw new ErroApi(401, 'Credenciais inválidas');

  const token = jwt.sign({ id: usuario.id, nome: usuario.nome }, SECRET, { expiresIn: '8h' });
  res.json({ token, usuario: semSenha(usuario) });
}));

// exige login e devolve só o mínimo: e-mail, matrícula e telefone não são de ninguém mais
app.get('/api/usuarios', auth, rota(async (_req, res) => {
  const lista = await Usuario.findAll({
    attributes: ['id', 'nome', 'curso', 'reputacao'],
    order: [['nome', 'ASC']],
  });
  res.json(lista);
}));

app.get('/api/eu', auth, rota(async (req, res) => {
  const usuario = await Usuario.findByPk(req.usuario.id);
  if (!usuario) throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
  res.json(semSenha(usuario));
}));

/* editar o proprio perfil + preferencias */
const CAMPOS_TEXTO = { nome: 120, curso: 120, telefone: 20 };
const CAMPOS_BOOL = [
  'pref_musica', 'pref_pets', 'pref_ar', 'pref_conversa', 'pref_recorrente',
  'notif_nova_carona', 'notif_solicitacao', 'notif_lembrete', 'notif_avaliacao',
];

app.patch('/api/usuarios/:id', auth, rota(async (req, res) => {
  if (idNumerico(req.params.id) !== req.usuario.id)
    throw new ErroApi(403, 'Você só pode editar o próprio perfil');

  const usuario = await Usuario.findByPk(req.usuario.id);
  if (!usuario) throw new ErroApi(404, 'Usuário não encontrado');

  const mudancas = {};
  for (const [campo, max] of Object.entries(CAMPOS_TEXTO)) {
    if (req.body[campo] !== undefined) {
      const valor = texto(req.body[campo], { campo, max, obrigatorio: campo === 'nome' });
      mudancas[campo] = valor;
    }
  }
  for (const campo of CAMPOS_BOOL) {
    if (req.body[campo] !== undefined) mudancas[campo] = booleano(req.body[campo]);
  }
  if (!Object.keys(mudancas).length) throw new ErroApi(400, 'Nenhum campo editável enviado');

  await usuario.update(mudancas);
  res.json(semSenha(usuario));
}));

/* ───── VEICULO ───── */
app.get('/api/veiculos', auth, rota(async (req, res) => {
  const lista = await Veiculo.findAll({
    where: { usuario_id: req.usuario.id },
    order: [['principal', 'DESC'], ['id', 'ASC']],
  });
  res.json(lista);
}));

app.post('/api/veiculos', auth, rota(async (req, res) => {
  const modelo = texto(req.body.modelo, { campo: 'modelo', obrigatorio: true, max: 120 });
  const cor    = texto(req.body.cor,    { campo: 'cor', max: 40 });
  const placa  = texto(req.body.placa,  { campo: 'placa', max: 10 });
  const querPrincipal = booleano(req.body.principal, false);

  const t = await sequelize.transaction();
  try {
    // trava o dono: serializa POSTs simultâneos e evita dois "principal"
    await Usuario.findByPk(req.usuario.id, { transaction: t, lock: t.LOCK.UPDATE });

    const total = await Veiculo.count({ where: { usuario_id: req.usuario.id }, transaction: t });
    const viraPrincipal = querPrincipal || total === 0;

    if (viraPrincipal) {
      await Veiculo.update({ principal: false }, { where: { usuario_id: req.usuario.id }, transaction: t });
    }

    const veiculo = await Veiculo.create(
      { modelo, cor, placa, principal: viraPrincipal, usuario_id: req.usuario.id },
      { transaction: t }
    );

    await t.commit();
    res.status(201).json(veiculo);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

app.patch('/api/veiculos/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const t = await sequelize.transaction();
  try {
    await Usuario.findByPk(req.usuario.id, { transaction: t, lock: t.LOCK.UPDATE });

    const veiculo = await Veiculo.findByPk(id, { transaction: t });
    if (!veiculo) throw new ErroApi(404, 'Veículo não encontrado');
    if (veiculo.usuario_id !== req.usuario.id) throw new ErroApi(403, 'Este veículo não é seu');

    const mudancas = {};
    if (req.body.modelo !== undefined) mudancas.modelo = texto(req.body.modelo, { campo: 'modelo', obrigatorio: true, max: 120 });
    if (req.body.cor    !== undefined) mudancas.cor    = texto(req.body.cor,    { campo: 'cor', max: 40 });
    if (req.body.placa  !== undefined) mudancas.placa  = texto(req.body.placa,  { campo: 'placa', max: 10 });

    if (req.body.principal !== undefined) {
      mudancas.principal = booleano(req.body.principal);
      if (mudancas.principal) {
        await Veiculo.update({ principal: false }, { where: { usuario_id: req.usuario.id }, transaction: t });
      }
    }

    await veiculo.update(mudancas, { transaction: t });
    await t.commit();
    res.json(veiculo);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

app.delete('/api/veiculos/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const t = await sequelize.transaction();
  try {
    const veiculo = await Veiculo.findByPk(id, { transaction: t });
    if (!veiculo) throw new ErroApi(404, 'Veículo não encontrado');
    if (veiculo.usuario_id !== req.usuario.id) throw new ErroApi(403, 'Este veículo não é seu');

    const eraPrincipal = veiculo.principal;
    await veiculo.destroy({ transaction: t });

    if (eraPrincipal) {
      const proximo = await Veiculo.findOne({
        where: { usuario_id: req.usuario.id },
        order: [['id', 'ASC']],
        transaction: t,
      });
      if (proximo) await proximo.update({ principal: true }, { transaction: t });
    }

    await t.commit();
    res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

/* ───── CARONA (RF-P2, RF-P3) ───── */
app.post('/api/caronas', auth, rota(async (req, res) => {
  const origem     = texto(req.body.origem,     { campo: 'origem', obrigatorio: true });
  const destino    = texto(req.body.destino,    { campo: 'destino', obrigatorio: true });
  const veiculo    = texto(req.body.veiculo,    { campo: 'veículo', max: 120 });
  const observacao = texto(req.body.observacao, { campo: 'observação', max: 2000 });
  const paradas    = texto(req.body.paradas,    { campo: 'paradas' });
  const dias_semana = texto(req.body.dias_semana, { campo: 'dias da semana', max: 60 });

  const data_hora = new Date(req.body.data_hora);
  if (Number.isNaN(data_hora.getTime())) throw new ErroApi(400, 'data e hora inválidas');
  if (data_hora <= new Date()) throw new ErroApi(400, 'A carona precisa ser para uma data futura');

  const vagas_total = Number(req.body.vagas_total);
  if (!Number.isInteger(vagas_total) || vagas_total < 1 || vagas_total > 8)
    throw new ErroApi(400, 'vagas devem ser um número inteiro entre 1 e 8');

  const carona = await Carona.create({
    origem, destino, data_hora,
    vagas_total, vagas_disp: vagas_total,
    veiculo, observacao, paradas, dias_semana,
    aceita_musica: booleano(req.body.aceita_musica, true),
    aceita_pets:   booleano(req.body.aceita_pets, false),
    tem_ar:        booleano(req.body.tem_ar, true),
    origem_lat:  coordenada(req.body.origem_lat,  'origem_lat',  90),
    origem_lng:  coordenada(req.body.origem_lng,  'origem_lng',  180),
    destino_lat: coordenada(req.body.destino_lat, 'destino_lat', 90),
    destino_lng: coordenada(req.body.destino_lng, 'destino_lng', 180),
    distancia_km: numeroOpcional(req.body.distancia_km, 'distancia_km', 0, 9999),
    duracao_min:  numeroOpcional(req.body.duracao_min, 'duracao_min', 0, 100000),
    motorista_id: req.usuario.id,
  });
  res.status(201).json(carona);
}));

/* cancelar/concluir a propria carona: recusa as solicitacoes pendentes junto */
app.patch('/api/caronas/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const { status } = req.body;
  if (!['ativa', 'concluida', 'cancelada'].includes(status))
    throw new ErroApi(400, "status deve ser 'ativa', 'concluida' ou 'cancelada'");

  const t = await sequelize.transaction();
  try {
    // lock: cancelar não pode correr com um aceite em andamento
    const carona = await Carona.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!carona) throw new ErroApi(404, 'Carona não encontrada');
    if (carona.motorista_id !== req.usuario.id) throw new ErroApi(403, 'Você não é o motorista desta carona');

    carona.status = status;
    await carona.save({ transaction: t });

    if (status === 'cancelada') {
      await Solicitacao.update(
        { status: 'recusado' },
        { where: { carona_id: carona.id, status: 'pendente' }, transaction: t }
      );
    }

    await t.commit();
    res.json(carona);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

// busca: só caronas ativas, futuras e de outras pessoas
app.get('/api/caronas', auth, rota(async (req, res) => {
  const where = {
    status: 'ativa',
    data_hora: { [Op.gt]: new Date() },
    motorista_id: { [Op.ne]: req.usuario.id },
  };

  const destino = texto(req.query.destino, { campo: 'destino' });
  if (destino) where.destino = { [OP_CONTEM]: `%${destino}%` };

  const origem = texto(req.query.origem, { campo: 'origem' });
  if (origem) where.origem = { [OP_CONTEM]: `%${origem}%` };

  const caronas = await Carona.findAll({
    where,
    include: [{ model: Usuario, as: 'motorista', attributes: ['id', 'nome', 'reputacao'] }],
    order: [['data_hora', 'ASC']],
    limit: 100,
  });
  res.json(caronas);
}));

app.get('/api/caronas/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const carona = await Carona.findByPk(id, {
    include: [{ model: Usuario, as: 'motorista', attributes: ['id', 'nome', 'reputacao'] }],
  });
  if (!carona) throw new ErroApi(404, 'Carona não encontrada');

  const souMotorista = carona.motorista_id === req.usuario.id;

  // motorista vê tudo; os demais veem só quem já foi aceito, sem a mensagem privada
  const solicitacoes = await Solicitacao.findAll({
    where: souMotorista ? { carona_id: carona.id } : { carona_id: carona.id, status: 'aceito' },
    attributes: souMotorista
      ? ['id', 'status', 'mensagem', 'passageiro_id', 'createdAt']
      : ['id', 'status', 'passageiro_id'],
    include: [{ model: Usuario, as: 'passageiro', attributes: ['id', 'nome'] }],
    order: [['id', 'ASC']],
  });

  res.json({ ...carona.toJSON(), solicitacoes });
}));

/* ───── SOLICITACAO (RF-P4) ───── */
app.post('/api/caronas/:id/solicitacoes', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const mensagem = texto(req.body.mensagem, { campo: 'mensagem', max: 500 });

  const carona = await Carona.findByPk(id);
  if (!carona) throw new ErroApi(404, 'Carona não encontrada');
  if (carona.motorista_id === req.usuario.id)
    throw new ErroApi(400, 'Motorista não solicita a própria carona');
  if (carona.status !== 'ativa')
    throw new ErroApi(400, 'Esta carona não está mais ativa');
  if (new Date(carona.data_hora) <= new Date())
    throw new ErroApi(400, 'Esta carona já aconteceu');

  const jaPediu = await Solicitacao.findOne({
    where: { carona_id: carona.id, passageiro_id: req.usuario.id },
  });
  if (jaPediu) throw new ErroApi(409, 'Você já solicitou vaga nesta carona');

  try {
    const solicitacao = await Solicitacao.create({
      carona_id: carona.id,
      passageiro_id: req.usuario.id,
      mensagem,
    });
    res.status(201).json(solicitacao);
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError')
      throw new ErroApi(409, 'Você já solicitou vaga nesta carona');
    throw e;
  }
}));

/* solicitações recebidas (sou motorista) */
app.get('/api/solicitacoes', auth, rota(async (req, res) => {
  const lista = await Solicitacao.findAll({
    include: [
      { model: Usuario, as: 'passageiro', attributes: ['id', 'nome', 'reputacao'] },
      { model: Carona, as: 'carona', where: { motorista_id: req.usuario.id } },
    ],
    order: [['id', 'DESC']],
  });
  res.json(lista);
}));

/* solicitações que EU enviei (sou passageiro) — inclui pendentes e recusadas */
app.get('/api/minhas-solicitacoes', auth, rota(async (req, res) => {
  const lista = await Solicitacao.findAll({
    where: { passageiro_id: req.usuario.id },
    include: [{
      model: Carona, as: 'carona',
      include: [{ model: Usuario, as: 'motorista', attributes: ['id', 'nome', 'reputacao'] }],
    }],
    order: [['id', 'DESC']],
  });
  res.json(lista);
}));

/* passageiro desiste: devolve a vaga se já estava aceito */
app.delete('/api/solicitacoes/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const t = await sequelize.transaction();
  try {
    const solicitacao = await Solicitacao.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!solicitacao) throw new ErroApi(404, 'Solicitação não encontrada');
    if (solicitacao.passageiro_id !== req.usuario.id)
      throw new ErroApi(403, 'Esta solicitação não é sua');

    if (solicitacao.status === 'aceito') {
      const carona = await Carona.findByPk(solicitacao.carona_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (carona && carona.vagas_disp < carona.vagas_total) {
        carona.vagas_disp += 1;
        await carona.save({ transaction: t });
      }
    }

    await solicitacao.destroy({ transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

/* ───── ACEITE COM TRANSACAO (RF-P5 + RNF-P3) ───── */
app.patch('/api/solicitacoes/:id', auth, rota(async (req, res) => {
  const id = idNumerico(req.params.id);
  const { status } = req.body;
  if (!['aceito', 'recusado'].includes(status))
    throw new ErroApi(400, "status deve ser 'aceito' ou 'recusado'");

  const t = await sequelize.transaction();
  try {
    // lock na SOLICITAÇÃO: sem isso dois aceites simultâneos leem 'pendente' e
    // decrementam a vaga duas vezes para o mesmo passageiro
    const solicitacao = await Solicitacao.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!solicitacao) throw new ErroApi(404, 'Solicitação não encontrada');
    if (solicitacao.status !== 'pendente') throw new ErroApi(409, 'Solicitação já respondida');

    // LOCK na linha da carona: impede vender a mesma vaga duas vezes
    const carona = await Carona.findByPk(solicitacao.carona_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!carona) throw new ErroApi(404, 'Carona não encontrada');
    if (carona.motorista_id !== req.usuario.id) throw new ErroApi(403, 'Você não é o motorista desta carona');
    if (carona.status !== 'ativa') throw new ErroApi(400, 'Esta carona não está mais ativa');

    if (status === 'aceito') {
      if (carona.vagas_disp < 1) throw new ErroApi(409, 'Não há vagas disponíveis');
      carona.vagas_disp -= 1;
      await carona.save({ transaction: t });
    }

    solicitacao.status = status;
    await solicitacao.save({ transaction: t });

    await t.commit();
    res.json({ solicitacao, vagas_disp: carona.vagas_disp });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

/* ───── AVALIACAO (RF-P6) ───── */
app.post('/api/avaliacoes', auth, rota(async (req, res) => {
  const carona_id   = idNumerico(req.body.carona_id, 'carona_id');
  const avaliado_id = idNumerico(req.body.avaliado_id, 'avaliado_id');
  const comentario  = texto(req.body.comentario, { campo: 'comentário', max: 2000 });

  const nota = Number(req.body.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5)
    throw new ErroApi(400, 'nota deve ser um inteiro de 1 a 5');

  if (avaliado_id === req.usuario.id) throw new ErroApi(400, 'Você não pode avaliar a si mesmo');

  const carona = await Carona.findByPk(carona_id);
  if (!carona) throw new ErroApi(404, 'Carona não encontrada');
  if (carona.status === 'cancelada') throw new ErroApi(400, 'Carona cancelada não pode ser avaliada');
  if (new Date(carona.data_hora) > new Date())
    throw new ErroApi(400, 'Só é possível avaliar depois que a carona acontece');

  // quem avalia e quem é avaliado precisam ter participado JUNTOS desta carona
  const aceitos = await Solicitacao.findAll({
    where: { carona_id, status: 'aceito' },
    attributes: ['passageiro_id'],
  });
  const idsPassageiros = aceitos.map(s => s.passageiro_id);
  const souMotorista   = carona.motorista_id === req.usuario.id;
  const souPassageiro  = idsPassageiros.includes(req.usuario.id);

  if (!souMotorista && !souPassageiro)
    throw new ErroApi(403, 'Você não participou desta carona');

  const alvoValido = souMotorista
    ? idsPassageiros.includes(avaliado_id)          // motorista avalia passageiro aceito
    : avaliado_id === carona.motorista_id;          // passageiro avalia o motorista
  if (!alvoValido)
    throw new ErroApi(403, 'Esta pessoa não participou desta carona com você');

  const t = await sequelize.transaction();
  try {
    // trava o avaliado: dois avaliadores simultâneos calculariam a média sem
    // enxergar um ao outro e gravariam um valor errado
    const alvo = await Usuario.findByPk(avaliado_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!alvo) throw new ErroApi(404, 'Usuário avaliado não encontrado');

    const jaAvaliou = await Avaliacao.findOne({
      where: { carona_id, avaliador_id: req.usuario.id, avaliado_id },
      transaction: t,
    });
    if (jaAvaliou) throw new ErroApi(409, 'Você já avaliou esta pessoa nesta carona');

    const avaliacao = await Avaliacao.create(
      { carona_id, avaliado_id, avaliador_id: req.usuario.id, nota, comentario },
      { transaction: t }
    );

    const media = await Avaliacao.findAll({
      where: { avaliado_id },
      attributes: [[sequelize.fn('AVG', sequelize.col('nota')), 'media']],
      raw: true, transaction: t,
    });
    await alvo.update({ reputacao: Number(media[0].media).toFixed(2) }, { transaction: t });

    await t.commit();
    res.status(201).json(avaliacao);
  } catch (e) {
    await t.rollback();
    if (e.name === 'SequelizeUniqueConstraintError')
      throw new ErroApi(409, 'Você já avaliou esta pessoa nesta carona');
    throw e;
  }
}));

app.get('/api/avaliacoes', auth, rota(async (req, res) => {
  const where = {};
  if (req.query.avaliado_id)  where.avaliado_id  = idNumerico(req.query.avaliado_id, 'avaliado_id');
  if (req.query.avaliador_id) where.avaliador_id = idNumerico(req.query.avaliador_id, 'avaliador_id');
  if (req.query.carona_id)    where.carona_id    = idNumerico(req.query.carona_id, 'carona_id');

  const lista = await Avaliacao.findAll({
    where,
    include: [{ model: Usuario, as: 'avaliador', attributes: ['id', 'nome'] }],
    order: [['id', 'DESC']],
    limit: 100,
  });
  res.json(lista);
}));

/* ───── HISTORICO (RF-P7) ───── */
app.get('/api/historico', auth, rota(async (req, res) => {
  const comoMotorista = await Carona.findAll({
    where: { motorista_id: req.usuario.id },
    order: [['data_hora', 'DESC']],
  });
  const comoPassageiro = await Solicitacao.findAll({
    where: { passageiro_id: req.usuario.id, status: 'aceito' },
    include: [{ model: Carona, as: 'carona' }],
  });
  res.json({ comoMotorista, comoPassageiro });
}));

/* ───── 404 e ERRO ───── */
app.use('/api', (_req, _res, next) => next(new ErroApi(404, 'Rota não encontrada')));

app.use((err, _req, res, _next) => {
  if (err instanceof ErroApi) return res.status(err.status).json({ erro: err.message });

  // erro inesperado: loga inteiro no servidor, devolve genérico pro cliente
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

/* ───── BOOT ───── */
(async () => {
  await sequelize.authenticate();
  await sequelize.sync();
  app.listen(PORT, () =>
    console.log(`CaronaUni API em http://localhost:${PORT}  (dialeto: ${process.env.DB_DIALECT || 'postgres'})`)
  );
})().catch((e) => {
  console.error('Falha ao subir:', e.message);
  process.exit(1);
});
