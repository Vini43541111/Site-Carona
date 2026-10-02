/**
 * ATENÇÃO: apaga e recria TODAS as tabelas. Use só em banco de desenvolvimento.
 * Uso: npm run seed
 */
const bcrypt = require('bcryptjs');
const { sequelize, Usuario, Veiculo, Carona, Solicitacao } = require('./src/models');

/** Data futura: daqui a N dias, no horário informado */
function daquiA(dias, hora, minuto = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

(async () => {
  await sequelize.sync({ force: true });
  const hash = await bcrypt.hash('123456', 10);

  const vinicius = await Usuario.create({
    nome: 'Vinicius Oliveira', email: 'vinicius@unoesc.edu.br', matricula: '2023001',
    senha_hash: hash, curso: 'Sistemas de Informação', telefone: '49999990001',
  });
  const carlos = await Usuario.create({
    nome: 'Carlos Medeiros', email: 'carlos@unoesc.edu.br', matricula: '2023002',
    senha_hash: hash, curso: 'Engenharia de Software', telefone: '49999990002',
  });
  const ana = await Usuario.create({
    nome: 'Ana Souza', email: 'ana@unoesc.edu.br', matricula: '2023003',
    senha_hash: hash, curso: 'Administração', telefone: '49999990003',
  });

  await Veiculo.create({ usuario_id: carlos.id, modelo: 'Fiat Uno 2019', cor: 'Prata', placa: 'ABC-1234', principal: true });
  await Veiculo.create({ usuario_id: ana.id,    modelo: 'HB20 2021',     cor: 'Branco', placa: 'XYZ-9876', principal: true });
  await Veiculo.create({ usuario_id: vinicius.id, modelo: 'Gol 2018',    cor: 'Preto',  placa: 'QWE-4567', principal: true });

  // Campus Unoesc Chapecó
  const CAMPUS = { lat: -27.1344867, lng: -52.5993719 };
  // Centro de Chapecó (aproximado, só para os dados de exemplo terem pino)
  const CENTRO = { lat: -27.0964, lng: -52.6156 };

  const c1 = await Carona.create({
    motorista_id: carlos.id,
    origem: 'Centro – Av. Getúlio Vargas', destino: 'Campus Unoesc – Portaria Principal',
    data_hora: daquiA(1, 7, 30), vagas_total: 3, vagas_disp: 3,
    veiculo: 'Fiat Uno 2019 – Prata', observacao: 'Saio pontualmente às 7h30.',
    paradas: 'Terminal Central', dias_semana: 'Seg,Qua,Sex',
    aceita_musica: true, aceita_pets: false, tem_ar: true,
    origem_lat: CENTRO.lat, origem_lng: CENTRO.lng,
    destino_lat: CAMPUS.lat, destino_lng: CAMPUS.lng,
  });

  // sem coordenada de propósito: exercita o fallback de geocodificação por endereço
  await Carona.create({
    motorista_id: ana.id,
    origem: 'Bairro Efapi – Rua Principal', destino: 'Campus Unoesc – Portaria Principal',
    data_hora: daquiA(2, 7, 45), vagas_total: 2, vagas_disp: 2,
    veiculo: 'HB20 2021 – Branco', aceita_musica: true, aceita_pets: true, tem_ar: true,
  });

  await Carona.create({
    motorista_id: carlos.id,
    origem: 'Campus Unoesc', destino: 'Centro – Terminal Urbano',
    data_hora: daquiA(1, 18, 0), vagas_total: 3, vagas_disp: 3,
    veiculo: 'Fiat Uno 2019 – Prata', observacao: 'Volta no fim da aula.',
    origem_lat: CAMPUS.lat, origem_lng: CAMPUS.lng,
    destino_lat: CENTRO.lat, destino_lng: CENTRO.lng,
  });

  // uma solicitação pendente para a tela de gerenciamento já ter conteúdo
  await Solicitacao.create({
    carona_id: c1.id, passageiro_id: ana.id,
    mensagem: 'Posso embarcar no Terminal Central?',
  });

  console.log('Seed pronto.');
  console.log('  Logins: vinicius@unoesc.edu.br | carlos@unoesc.edu.br | ana@unoesc.edu.br');
  console.log('  Senha:  123456');
  process.exit(0);
})().catch((e) => {
  console.error('Falha no seed:', e.message);
  process.exit(1);
});
