# CaronaUni

Plataforma de caronas universitárias (Unoesc). Node + Express + Sequelize + PostgreSQL
no backend, HTML/CSS/JS puro no frontend — sem build step, sem framework.

O Express serve o frontend e a API no mesmo processo, então **é um serviço só**:
`http://localhost:3000` entrega as telas e `/api/*` responde os dados.

## Subir localmente

```bash
npm install
cp .env.example .env     # edite: senha do banco + JWT_SECRET
```

Crie o banco (se ainda não existir):

```bash
docker run --name caronauni-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=caronauni -p 5432:5432 -d postgres:16
```

Depois:

```bash
npm run seed    # cria as tabelas e popula dados de exemplo (APAGA TUDO)
npm start
```

Abra `http://localhost:3000`. Contas de exemplo — senha `123456`:
`vinicius@unoesc.edu.br`, `carlos@unoesc.edu.br`, `ana@unoesc.edu.br`.

> `JWT_SECRET` é obrigatório: sem ele o servidor não sobe (evita subir com segredo padrão).

### Banco que já tem dados

`npm run seed` apaga tudo. Para só adicionar colunas novas num banco existente:

```bash
npm run migrate
```

## Telas

| Arquivo | O quê |
|---|---|
| `index.html` | Login e cadastro |
| `dashboard.html` | Próximas caronas, notificações e estatísticas |
| `buscar.html` | Busca de caronas com filtros, ordenação e mapa |
| `criar.html` | Publicar carona (mapa, recorrência, veículo) |
| `detalhes.html` | Detalhe da carona, avaliações do motorista, pedir vaga |
| `solicitacoes.html` | Aceitar/recusar pedidos, gerenciar minhas caronas |
| `historico.html` | Histórico, meus pedidos enviados, avaliações pendentes |
| `perfil.html` | Dados, veículos e preferências |
| `avaliacao.html` | Avaliar motorista ou passageiro |

## Entidades

`usuario` · `veiculo` · `carona` · `solicitacao` · `avaliacao`

## API

Tudo abaixo de `/api`. Exceto `POST /usuarios` e `POST /login`, **todas exigem**
`Authorization: Bearer <token>`.

| Método | Rota | O quê |
|---|---|---|
| POST | `/usuarios` | Cadastro |
| POST | `/login` | Devolve `{token, usuario}` |
| GET | `/eu` | Usuário logado |
| PATCH | `/usuarios/:id` | Edita o próprio perfil e preferências |
| GET | `/usuarios` | Lista reduzida (id, nome, curso, reputação) |
| GET/POST | `/veiculos` | Lista / cadastra veículo |
| PATCH/DELETE | `/veiculos/:id` | Edita / remove |
| GET | `/caronas` | Busca: só ativas, futuras e de outras pessoas. `?destino=` `?origem=` |
| POST | `/caronas` | Publica carona |
| GET | `/caronas/:id` | Detalhe (mensagens das solicitações só para o motorista) |
| PATCH | `/caronas/:id` | Motorista muda status (`cancelada` / `concluida`) |
| POST | `/caronas/:id/solicitacoes` | Pedir vaga |
| GET | `/solicitacoes` | Pedidos recebidos (sou motorista) |
| GET | `/minhas-solicitacoes` | Pedidos que enviei (sou passageiro) |
| PATCH | `/solicitacoes/:id` | Motorista aceita/recusa |
| DELETE | `/solicitacoes/:id` | Passageiro desiste (devolve a vaga) |
| GET/POST | `/avaliacoes` | Lista / cria avaliação |
| GET | `/historico` | `{comoMotorista, comoPassageiro}` |

Erros sempre voltam como `{ "erro": "mensagem" }`.

## Regras aplicadas no servidor

- Só quem **participou** da carona pode avaliar, e só depois que ela aconteceu.
  Motorista avalia passageiro aceito; passageiro avalia o motorista. Uma vez cada.
- Uma solicitação por passageiro por carona (constraint no banco).
- Aceitar uma solicitação decrementa a vaga sob `SELECT FOR UPDATE` na carona **e**
  na solicitação — duas requisições simultâneas não consomem a mesma vaga.
- Cancelar carona recusa as solicitações pendentes na mesma transação.
- Ninguém edita perfil, veículo ou carona de outra pessoa.
