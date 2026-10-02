const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/* ───── USUARIO ───── */
const Usuario = sequelize.define('usuario', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nome:       { type: DataTypes.STRING(120), allowNull: false,
                validate: { notEmpty: true } },
  email:      { type: DataTypes.STRING(150), allowNull: false, unique: true,
                validate: { isEmail: true, notEmpty: true } },
  matricula:  { type: DataTypes.STRING(20), allowNull: false, unique: true,
                validate: { notEmpty: true } },
  senha_hash: { type: DataTypes.STRING(255), allowNull: false },
  curso:      { type: DataTypes.STRING(120) },
  telefone:   { type: DataTypes.STRING(20) },
  reputacao:  { type: DataTypes.DECIMAL(3, 2), defaultValue: 0 },

  /* preferências padrão de carona */
  pref_musica:      { type: DataTypes.BOOLEAN, defaultValue: true },
  pref_pets:        { type: DataTypes.BOOLEAN, defaultValue: false },
  pref_ar:          { type: DataTypes.BOOLEAN, defaultValue: true },
  pref_conversa:    { type: DataTypes.BOOLEAN, defaultValue: true },
  pref_recorrente:  { type: DataTypes.BOOLEAN, defaultValue: true },

  /* preferências de notificação */
  notif_nova_carona:  { type: DataTypes.BOOLEAN, defaultValue: true },
  notif_solicitacao:  { type: DataTypes.BOOLEAN, defaultValue: true },
  notif_lembrete:     { type: DataTypes.BOOLEAN, defaultValue: true },
  notif_avaliacao:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'usuario', underscored: true });

/* ───── VEICULO ───── */
const Veiculo = sequelize.define('veiculo', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  modelo:    { type: DataTypes.STRING(120), allowNull: false },
  cor:       { type: DataTypes.STRING(40) },
  placa:     { type: DataTypes.STRING(10) },
  principal: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'veiculo', underscored: true });

/* ───── CARONA ───── */
const Carona = sequelize.define('carona', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  origem:      { type: DataTypes.STRING(255), allowNull: false,
                 validate: { notEmpty: true } },
  destino:     { type: DataTypes.STRING(255), allowNull: false,
                 validate: { notEmpty: true } },
  data_hora:   { type: DataTypes.DATE, allowNull: false },
  vagas_total: { type: DataTypes.INTEGER, allowNull: false,
                 validate: { min: 1, max: 8 } },
  vagas_disp:  { type: DataTypes.INTEGER, allowNull: false,
                 validate: { min: 0 } },
  veiculo:     { type: DataTypes.STRING(120) },
  observacao:  { type: DataTypes.TEXT },
  status:      { type: DataTypes.ENUM('ativa', 'concluida', 'cancelada'),
                 defaultValue: 'ativa' },

  paradas:     { type: DataTypes.STRING(255) },
  /* dias da recorrência, ex.: "Seg,Qua,Sex" — vazio = carona avulsa */
  dias_semana: { type: DataTypes.STRING(60) },

  /* coordenadas do trajeto, capturadas do mapa na publicação.
     Nulas em caronas antigas — nesse caso o front cai no geocoding. */
  origem_lat:  { type: DataTypes.DECIMAL(10, 7), validate: { min: -90,  max: 90  } },
  origem_lng:  { type: DataTypes.DECIMAL(10, 7), validate: { min: -180, max: 180 } },
  destino_lat: { type: DataTypes.DECIMAL(10, 7), validate: { min: -90,  max: 90  } },
  destino_lng: { type: DataTypes.DECIMAL(10, 7), validate: { min: -180, max: 180 } },

  /* vêm do cálculo de rota no momento da publicação */
  distancia_km: { type: DataTypes.DECIMAL(6, 2) },
  duracao_min:  { type: DataTypes.INTEGER },

  /* preferências desta carona */
  aceita_musica: { type: DataTypes.BOOLEAN, defaultValue: true },
  aceita_pets:   { type: DataTypes.BOOLEAN, defaultValue: false },
  tem_ar:        { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'carona', underscored: true });

/* ───── SOLICITACAO ───── */
const Solicitacao = sequelize.define('solicitacao', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  mensagem: { type: DataTypes.TEXT },
  status:   { type: DataTypes.ENUM('pendente', 'aceito', 'recusado'),
              defaultValue: 'pendente' },
}, {
  tableName: 'solicitacao',
  underscored: true,
  indexes: [
    // uma solicitação por passageiro por carona
    { unique: true, fields: ['carona_id', 'passageiro_id'], name: 'solicitacao_unica_por_carona' },
  ],
});

/* ───── AVALIACAO ───── */
const Avaliacao = sequelize.define('avaliacao', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nota:       { type: DataTypes.INTEGER, allowNull: false,
                validate: { min: 1, max: 5 } },
  comentario: { type: DataTypes.TEXT },
}, {
  tableName: 'avaliacao',
  underscored: true,
  indexes: [
    // cada pessoa avalia a outra uma única vez por carona
    { unique: true, fields: ['carona_id', 'avaliador_id', 'avaliado_id'], name: 'avaliacao_unica_por_carona' },
  ],
});

/* ───── ASSOCIACOES (as FKs do modelo ER) ───── */
Usuario.hasMany(Carona,   { foreignKey: 'motorista_id', as: 'caronas' });
Carona.belongsTo(Usuario, { foreignKey: 'motorista_id', as: 'motorista' });

Usuario.hasMany(Veiculo,   { foreignKey: 'usuario_id', as: 'veiculos' });
Veiculo.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'dono' });

Carona.hasMany(Solicitacao,   { foreignKey: 'carona_id', as: 'solicitacoes' });
Solicitacao.belongsTo(Carona, { foreignKey: 'carona_id', as: 'carona' });

Usuario.hasMany(Solicitacao,   { foreignKey: 'passageiro_id', as: 'solicitacoes' });
Solicitacao.belongsTo(Usuario, { foreignKey: 'passageiro_id', as: 'passageiro' });

Carona.hasMany(Avaliacao,   { foreignKey: 'carona_id', as: 'avaliacoes' });
Avaliacao.belongsTo(Carona, { foreignKey: 'carona_id', as: 'carona' });

Avaliacao.belongsTo(Usuario, { foreignKey: 'avaliador_id', as: 'avaliador' });
Avaliacao.belongsTo(Usuario, { foreignKey: 'avaliado_id',  as: 'avaliado' });

module.exports = { sequelize, Usuario, Veiculo, Carona, Solicitacao, Avaliacao };
