/**
 * Migração idempotente: adiciona as colunas novas em tabelas que já existem.
 * O sync() do server.js cria tabelas novas (ex.: veiculo), mas não altera as antigas.
 * Pode rodar quantas vezes quiser: `npm run migrate`
 */
const sequelize = require('./src/db');

const COLUNAS = {
  usuario: {
    pref_musica:       'BOOLEAN DEFAULT true',
    pref_pets:         'BOOLEAN DEFAULT false',
    pref_ar:           'BOOLEAN DEFAULT true',
    pref_conversa:     'BOOLEAN DEFAULT true',
    pref_recorrente:   'BOOLEAN DEFAULT true',
    notif_nova_carona: 'BOOLEAN DEFAULT true',
    notif_solicitacao: 'BOOLEAN DEFAULT true',
    notif_lembrete:    'BOOLEAN DEFAULT true',
    notif_avaliacao:   'BOOLEAN DEFAULT true',
  },
  carona: {
    paradas:       'VARCHAR(255)',
    dias_semana:   'VARCHAR(60)',
    aceita_musica: 'BOOLEAN DEFAULT true',
    aceita_pets:   'BOOLEAN DEFAULT false',
    tem_ar:        'BOOLEAN DEFAULT true',
    origem_lat:    'DECIMAL(10,7)',
    origem_lng:    'DECIMAL(10,7)',
    destino_lat:   'DECIMAL(10,7)',
    destino_lng:   'DECIMAL(10,7)',
    distancia_km:  'DECIMAL(6,2)',
    duracao_min:   'INTEGER',
  },
};

(async () => {
  await sequelize.authenticate();
  let novas = 0;

  for (const [tabela, colunas] of Object.entries(COLUNAS)) {
    for (const [coluna, tipo] of Object.entries(colunas)) {
      const [linhas] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = '${tabela}' AND column_name = '${coluna}'`
      );
      if (linhas.length) continue;

      await sequelize.query(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
      console.log(`  + ${tabela}.${coluna}`);
      novas++;
    }
  }

  console.log(novas ? `\n${novas} coluna(s) adicionada(s).` : '\nBanco já estava atualizado.');
  process.exit(0);
})().catch(e => {
  console.error('Falha na migração:', e.message);
  process.exit(1);
});
