# Prime Sneaker

E-commerce de tênis desenvolvido com HTML, CSS, JavaScript, Node.js, Express e PostgreSQL.

O sistema possui catálogo, variações de cor e tamanho, carrinho persistido, favoritos, avaliações, cupons, checkout com PIX, pedidos, newsletter e painel administrativo com controle de produtos, estoque, clientes, administradores e auditoria.

## Tecnologias

- Front-end: HTML5, CSS3 e JavaScript.
- Back-end: Node.js, Express e API REST.
- Banco de dados: PostgreSQL hospedado no Neon.
- Autenticação: JWT e senhas protegidas com bcrypt.
- E-mail: Nodemailer.
- PIX: QR Code e Pix Copia e Cola calculados pelo backend.
- Documentação: Swagger opcional.
- Testes: regressões de segurança e regras de negócio com Node.js.

## Estrutura

```text
prime-sneaker/
|-- backend/               # API, banco, rotas, controllers, models e testes
|-- frontend/              # Loja pública e painel administrativo
|-- backend/.env.example   # Modelo das variáveis de ambiente
|-- .gitignore
`-- README.md
```

## Banco de dados Neon

O banco oficial fica no [Neon](https://neon.tech). O Neon mantém os dados na nuvem, portanto computadores configurados com o mesmo projeto acessam os mesmos produtos, contas, pedidos, cupons e registros.

O arquivo com a senha do banco é o `backend/.env`. Ele não é enviado ao GitHub por segurança e deve ser criado manualmente em cada computador.

### Como obter os dados de conexão

1. Entre no painel do Neon.
2. Abra o projeto `prime-sneaker`.
3. Selecione a branch `production`.
4. Clique em `Connect`.
5. Ative `Connection pooling`.
6. Abra `Connection parameters`.
7. Copie `Host`, `Database`, `Role` e `Password`.
8. Use preferencialmente o host que contém `-pooler`.

O Neon exige SSL, portanto use `DB_SSL=true`.

> Nunca envie a connection string, a senha do Neon, o JWT secret, a chave PIX ou a senha de e-mail ao GitHub.

## Pré-requisitos

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 18 ou superior
- Acesso ao projeto no Neon
- Navegador atualizado

Não é necessário instalar PostgreSQL localmente quando o projeto usa o Neon.

## Como abrir o site em um computador

### 1. Clonar o projeto

Abra o PowerShell ou o terminal do VS Code:

```powershell
git clone https://github.com/GabrielJavornik/prime-sneaker.git
cd prime-sneaker
```

### 2. Instalar as dependências

```powershell
cd backend
npm install
```

### 3. Criar o arquivo de configuração

Ainda dentro da pasta `backend`:

```powershell
Copy-Item .env.example .env
```

Abra o arquivo `backend/.env` e configure:

```env
PORT=3000
NODE_ENV=development
APP_TIMEZONE=America/Sao_Paulo
APP_URL=http://localhost:3000

CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENABLE_API_DOCS=false

# Neon PostgreSQL
DB_HOST=ep-seu-projeto-pooler.regiao.aws.neon.tech
DB_PORT=5432
DB_USER=neondb_owner
DB_PASSWORD=SENHA_REAL_DO_NEON
DB_NAME=neondb
DB_SSL=true

# Segurança
JWT_SECRET=COLOQUE_UMA_CHAVE_ALEATORIA_COM_PELO_MENOS_32_CARACTERES
JWT_EXPIRES_IN=7d
ENABLE_BASIC_AUTH=false

# Superadmin inicial
SEED_SUPERADMIN_NAME=Super Administrador
SEED_SUPERADMIN_EMAIL=SEU_EMAIL_ADMIN
SEED_SUPERADMIN_PASSWORD=UMA_SENHA_FORTE

# PIX
PIX_KEY=SUA_CHAVE_PIX
PIX_MERCHANT_NAME=PRIME SNEAKER
PIX_MERCHANT_CITY=ERECHIM

# E-mail
EMAIL_USER=SEU_EMAIL
EMAIL_PASS=SENHA_DE_APLICATIVO_DO_EMAIL
```

Use no outro computador as mesmas configurações do Neon para acessar o mesmo banco. O `JWT_SECRET` também deve ser o mesmo quando as sessões precisarem continuar válidas entre ambientes.

### 4. Preparar o banco

Se o banco Neon já contém as tabelas e os dados do projeto, execute:

```powershell
npm run migrate
```

Se estiver configurando um projeto Neon completamente vazio pela primeira vez, execute:

```powershell
npm run init-db
npm run migrate
```

As migrações usam operações seguras, como `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`.

### 5. Testar o projeto

```powershell
npm test
```

### 6. Iniciar o site

```powershell
npm start
```

Mantenha o terminal aberto enquanto estiver usando o site. Quando aparecer a mensagem de conexão com o PostgreSQL e o servidor estiver ativo, abra:

- Loja: [http://localhost:3000](http://localhost:3000)
- Catálogo: [http://localhost:3000/busca](http://localhost:3000/busca)
- Carrinho: [http://localhost:3000/carrinho](http://localhost:3000/carrinho)
- Login administrativo: [http://localhost:3000/admin-login.html](http://localhost:3000/admin-login.html)
- Painel administrativo: [http://localhost:3000/adm.html](http://localhost:3000/adm.html)

O backend também serve os arquivos do front-end. Não é necessário iniciar outro servidor ou usar a extensão Live Server.

## Comandos principais

Execute dentro da pasta `backend`:

```powershell
npm start       # inicia o sistema
npm run dev     # inicia com reinicialização automática
npm run init-db # cria a estrutura inicial em um banco vazio
npm run migrate # aplica as migrações pendentes
npm test        # executa os testes de regressão
```

## Como atualizar o projeto em outro computador

Quando novas alterações forem enviadas ao GitHub:

```powershell
cd prime-sneaker
git pull origin main
cd backend
npm install
npm run migrate
npm test
npm start
```

O `git pull` atualiza o código. Os dados não precisam ser copiados porque continuam armazenados no Neon.

## Rotas principais

### Autenticação

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `POST /api/forgot-password`
- `POST /api/reset-password`
- `POST /api/admin/forgot-password`
- `POST /api/admin/reset-password`

### Produtos

- `GET /api/products`
- `GET /api/products/facets`
- `GET /api/search`
- `GET /api/product/:id`
- `POST /api/products`
- `PUT /api/product/:id`
- `DELETE /api/product/:id`
- `GET /api/products/:id/images`
- `POST /api/products/:id/images`
- `POST /api/products/images/upload`
- `GET /api/products/:id/size-stock`
- `POST /api/products/:id/size-stock`

### Carrinho

- `GET /api/cart`
- `PUT /api/cart/items`
- `DELETE /api/cart/items/:productId`
- `DELETE /api/cart`

### Pedidos e pagamentos

- `POST /api/orders`
- `GET /api/orders/my-orders`
- `GET /api/orders/admin/all`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`
- `DELETE /api/orders/:id/cancel`
- `POST /api/payments/pix-preview`
- `POST /api/payments/checkout`
- `GET /api/payments/pix/:orderId`
- `POST /api/payments/confirm`

A prévia do PIX não cria um pedido. O pedido é registrado quando o cliente confirma o pagamento realizado.

### Cupons, favoritos e avaliações

- `GET /api/coupons`
- `POST /api/coupons`
- `PUT /api/coupons/:id`
- `DELETE /api/coupons/:id`
- `GET /api/wishlist`
- `POST /api/wishlist/add`
- `DELETE /api/wishlist/:productId`
- `POST /api/products/:productId/reviews`
- `GET /api/products/:productId/reviews`

### Administração

- `GET /api/admin/session`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `GET /api/admin-reports/order-notifications`
- `GET /api/admin-reports/customers`
- `GET /api/admin-reports/low-stock`
- `GET /api/admin-audit-logs`

## Exemplos de requisição

Os exemplos abaixo usam PowerShell e podem ser testados com o servidor rodando em `http://localhost:3000`.

### Criar conta de cliente

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/register `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "name": "Cliente Teste",
    "lastName": "Prime",
    "email": "cliente@example.com",
    "phone": "(54) 99999-9999",
    "password": "Senha123",
    "confirmPassword": "Senha123"
  }'
```

### Login

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/login `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "email": "cliente@example.com",
    "password": "Senha123"
  }'
```

### Buscar produtos

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/search?brand=Nike&sort=price_asc" `
  -Method GET
```

### Gerar prévia de PIX

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/payments/pix-preview `
  -Method POST `
  -Headers @{ Authorization = "Bearer SEU_TOKEN_JWT" } `
  -ContentType "application/json" `
  -Body '{
    "items": [
      {
        "productId": 1,
        "quantity": 1,
        "size": "39"
      }
    ],
    "shipping": {
      "cep": "99711-170"
    }
  }'
```

## Swagger

Para usar a documentação local da API, altere no `.env`:

```env
ENABLE_API_DOCS=true
```

Reinicie o servidor e abra:

```text
http://localhost:3000/api-docs
```

O Swagger permanece desativado em produção.

## Regras de acesso

- Clientes podem comprar, favoritar, avaliar, editar o perfil e consultar seus pedidos.
- Admins podem gerenciar pedidos e acompanhar informações operacionais.
- Superadmins podem criar e editar administradores, gerenciar cupons e consultar a auditoria.
- A confirmação manual de pagamento é restrita ao painel administrativo.
- Rotas protegidas utilizam `Authorization: Bearer TOKEN`.

## Segurança

- `backend/.env` e `node_modules` não são versionados.
- Senhas são armazenadas com hash bcrypt.
- O servidor exige um `JWT_SECRET` forte.
- O Basic Auth legado permanece desativado.
- O CORS utiliza uma lista de origens permitidas.
- A API possui proteção de rotas por perfil.

Se alguma credencial for publicada acidentalmente, redefina imediatamente a senha no Neon ou no serviço correspondente e atualize todos os arquivos `.env`.

## Repositório

[github.com/GabrielJavornik/prime-sneaker](https://github.com/GabrielJavornik/prime-sneaker)
