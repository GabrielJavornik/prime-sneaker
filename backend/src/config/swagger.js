/**
 * Configuracao do Swagger/OpenAPI.
 * A documentacao estara disponivel em /api-docs
 */
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Prime Sneaker',
            version: '1.0.0',
            description: 'API RESTful para o e-commerce Prime Sneaker (Trabalho Final).',
            contact: {
                name: 'Gabriel',
                email: 'gabrieljavornik1234@gmail.com',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Servidor local',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
                basicAuth: {
                    type: 'http',
                    scheme: 'basic',
                    description: 'Legado e restrito a ambiente local. Em producao use Bearer JWT.',
                },
            },
            tags: [
                { name: 'Carrinho', description: 'Carrinho persistido para usuarios autenticados.' },
                { name: 'Pedidos', description: 'Criacao, consulta e gestao de pedidos.' },
                { name: 'Pagamentos', description: 'Checkout seguro, Pix copia e cola e confirmacao administrativa.' },
                { name: 'Wishlist', description: 'Favoritos do usuario autenticado.' },
                { name: 'Enderecos', description: 'Enderecos de cobranca e entrega do usuario.' },
                { name: 'Admin', description: 'Sessao, administradores, relatorios e auditoria do painel.' },
            ],
            schemas: {
                Product: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        name: { type: 'string', example: 'Nike Air Max 90' },
                        description: { type: 'string' },
                        price: { type: 'number', example: 599.9 },
                        image_url: { type: 'string' },
                        sizes: { type: 'string', example: '38,39,40,41' },
                        color: { type: 'string', example: 'Vermelho' },
                        model_group: { type: 'string', example: 'nike-air-max-90' },
                        category: { type: 'string', example: 'casual' },
                        stock: { type: 'integer', example: 20 },
                    },
                },
                CartItem: {
                    type: 'object',
                    properties: {
                        productId: { type: 'integer', example: 1 },
                        size: { type: 'string', nullable: true, example: '40' },
                        quantity: { type: 'integer', example: 2 },
                    },
                },
                PersistedCartItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 12 },
                        productId: { type: 'integer', example: 1 },
                        name: { type: 'string', example: 'Vans Old Skool' },
                        image_url: { type: 'string' },
                        size: { type: 'string', nullable: true, example: '37' },
                        quantity: { type: 'integer', example: 2 },
                        price: { type: 'number', example: 349.9 },
                        original_price: { type: 'number', example: 399.9 },
                        discount_percent: { type: 'number', example: 10 },
                        stock: { type: 'integer', example: 12 },
                        lineTotal: { type: 'number', example: 699.8 },
                    },
                },
                PersistedCartResponse: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/PersistedCartItem' },
                        },
                        count: { type: 'integer', example: 2 },
                        subtotal: { type: 'number', example: 699.8 },
                    },
                },
                CartSummary: {
                    type: 'object',
                    properties: {
                        items: { type: 'array', items: { type: 'object' } },
                        subtotal: { type: 'number' },
                        shipping: { type: 'number' },
                        discount: { type: 'number' },
                        total: { type: 'number' },
                    },
                },
                CheckoutItem: {
                    type: 'object',
                    required: ['productId', 'quantity', 'size'],
                    properties: {
                        productId: { type: 'integer', example: 1 },
                        quantity: { type: 'integer', example: 2 },
                        size: { type: 'string', example: '40' },
                    },
                },
                CheckoutRequest: {
                    type: 'object',
                    required: ['items'],
                    properties: {
                        couponCode: { type: 'string', example: 'URI10' },
                        items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/CheckoutItem' },
                        },
                    },
                },
                CheckoutResponse: {
                    type: 'object',
                    properties: {
                        orderId: { type: 'integer', example: 52 },
                        subtotal: { type: 'number', example: 2099.4 },
                        shipping: { type: 'number', example: 25 },
                        shippingRegion: { type: 'string', example: 'Sudeste' },
                        discount: { type: 'number', example: 209.94 },
                        total: { type: 'number', example: 1914.46 },
                        coupon: { $ref: '#/components/schemas/Coupon' },
                        message: { type: 'string', example: 'Pedido criado' },
                    },
                },
                PixInfo: {
                    type: 'object',
                    properties: {
                        qrCode: { type: 'string', description: 'Data URL da imagem do QR Code Pix.' },
                        emvString: { type: 'string', description: 'Pix copia e cola com valor definido.' },
                        copiaECola: { type: 'string', description: 'Mesmo conteudo do EMV para copiar.' },
                        chave: { type: 'string', description: 'Chave Pix configurada no .env.' },
                        nome: { type: 'string', example: 'PRIME SNEAKER' },
                        valor: { type: 'string', example: '1889.46' },
                        txid: { type: 'string', example: 'PS52' },
                    },
                },
                OrderItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 10 },
                        product_id: { type: 'integer', example: 1 },
                        product_name: { type: 'string', example: 'Vans Old Skool' },
                        quantity: { type: 'integer', example: 1 },
                        size: { type: 'string', example: '37' },
                        price: { type: 'number', example: 349.9 },
                    },
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 52 },
                        user_id: { type: 'integer', example: 7 },
                        subtotal: { type: 'number', example: 349.9 },
                        shipping: { type: 'number', example: 25 },
                        discount: { type: 'number', example: 0 },
                        total: { type: 'number', example: 374.9 },
                        coupon_code: { type: 'string', nullable: true, example: 'URI10' },
                        status: {
                            type: 'string',
                            enum: ['aguardando_pagamento', 'processando', 'enviado', 'entregue', 'cancelado'],
                            example: 'aguardando_pagamento',
                        },
                        created_at: { type: 'string', format: 'date-time' },
                        items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/OrderItem' },
                        },
                    },
                },
                Address: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 3 },
                        user_id: { type: 'integer', example: 7 },
                        type: { type: 'string', example: 'shipping' },
                        street: { type: 'string', example: 'Rua Itarare' },
                        number: { type: 'string', example: '123' },
                        complement: { type: 'string', example: 'Casa' },
                        neighborhood: { type: 'string', example: 'Centro' },
                        city: { type: 'string', example: 'Erechim' },
                        state: { type: 'string', example: 'RS' },
                        cep: { type: 'string', example: '99700-098' },
                        is_default: { type: 'boolean', example: true },
                    },
                },
                WishlistItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        product_id: { type: 'integer', example: 12 },
                        name: { type: 'string', example: 'Adidas Ultraboost 22' },
                        price: { type: 'number', example: 899 },
                        image_url: { type: 'string' },
                        category: { type: 'string', example: 'esportivo' },
                        stock: { type: 'integer', example: 30 },
                    },
                },
                Coupon: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        code: { type: 'string', example: 'URI10' },
                        discount_percent: { type: 'integer', example: 10 },
                        active: { type: 'boolean' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        is_admin: { type: 'boolean' },
                    },
                },
                AdminSession: {
                    type: 'object',
                    properties: {
                        authenticated: { type: 'boolean', example: true },
                        user: { $ref: '#/components/schemas/User' },
                    },
                },
                AdminAuditLog: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 15 },
                        admin_name: { type: 'string', example: 'Administrador' },
                        admin_email: { type: 'string', example: 'admin@tenis.com' },
                        action: { type: 'string', example: 'payment.confirm' },
                        entity_type: { type: 'string', example: 'order' },
                        entity_id: { type: 'integer', example: 52 },
                        details: { type: 'object' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        status: { type: 'integer' },
                    },
                },
            },
        },
        paths: {
            '/api/health': {
                get: {
                    tags: ['Health'],
                    summary: 'Verifica se a API esta online',
                    responses: {
                        200: {
                            description: 'Servico online',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'ok' },
                                            uptime: { type: 'number', example: 120.5 },
                                            timestamp: { type: 'string', format: 'date-time' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/forgot-password': {
                post: {
                    tags: ['Autenticacao'],
                    summary: 'Solicita recuperacao de senha do usuario',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email'],
                                    properties: { email: { type: 'string', example: 'cliente@email.com' } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Link enviado quando o email existe' },
                        400: { description: 'Email invalido' },
                    },
                },
            },
            '/api/admin/forgot-password': {
                post: {
                    tags: ['Autenticacao', 'Admin'],
                    summary: 'Solicita recuperacao de senha administrativa',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email'],
                                    properties: { email: { type: 'string', example: 'admin@tenis.com' } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Mensagem generica por seguranca' },
                        400: { description: 'Email invalido' },
                    },
                },
            },
            '/api/verify-reset-token/{token}': {
                get: {
                    tags: ['Autenticacao'],
                    summary: 'Valida token de recuperacao do usuario',
                    parameters: [
                        { name: 'token', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Token valido' },
                        400: { description: 'Token invalido ou expirado' },
                    },
                },
            },
            '/api/admin/verify-reset-token': {
                get: {
                    tags: ['Autenticacao', 'Admin'],
                    summary: 'Valida token administrativo por query string',
                    parameters: [
                        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Token valido' },
                        400: { description: 'Token invalido ou expirado' },
                    },
                },
            },
            '/api/admin/verify-reset-token/{token}': {
                get: {
                    tags: ['Autenticacao', 'Admin'],
                    summary: 'Valida token administrativo por parametro de rota',
                    parameters: [
                        { name: 'token', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Token valido' },
                        400: { description: 'Token invalido ou expirado' },
                    },
                },
            },
            '/api/reset-password': {
                post: {
                    tags: ['Autenticacao'],
                    summary: 'Redefine senha do usuario',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['token', 'password'],
                                    properties: {
                                        token: { type: 'string' },
                                        password: { type: 'string', example: 'SenhaForte123' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Senha alterada' },
                        400: { description: 'Token invalido ou senha fraca' },
                    },
                },
            },
            '/api/admin/reset-password': {
                post: {
                    tags: ['Autenticacao', 'Admin'],
                    summary: 'Redefine senha de admin ou superadmin',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['token', 'password'],
                                    properties: {
                                        token: { type: 'string' },
                                        password: { type: 'string', example: 'SenhaForte123' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Senha administrativa alterada' },
                        400: { description: 'Token invalido ou senha fraca' },
                    },
                },
            },
            '/api/users/profile': {
                get: {
                    tags: ['Usuarios'],
                    summary: 'Retorna perfil do usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Perfil do usuario', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                        401: { description: 'Token ausente ou invalido' },
                    },
                },
                put: {
                    tags: ['Usuarios'],
                    summary: 'Atualiza perfil, telefone, CPF, endereco ou senha',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string', example: 'Gabriel Novelo' },
                                        email: { type: 'string', example: 'gabriel@email.com' },
                                        phone: { type: 'string', example: '(54) 99999-9999' },
                                        cpf: { type: 'string', example: '000.000.000-00' },
                                        cep: { type: 'string', example: '99711-170' },
                                        address: { type: 'object' },
                                        currentPassword: { type: 'string' },
                                        newPassword: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Perfil atualizado' },
                        400: { description: 'Dados invalidos' },
                    },
                },
            },
            '/api/products/facets': {
                get: {
                    tags: ['Produtos'],
                    summary: 'Retorna marcas, tamanhos e grupos usados no mega menu',
                    parameters: [
                        { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1', 'true'] } },
                    ],
                    responses: {
                        200: {
                            description: 'Facets do catalogo',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            brands: { type: 'array', items: { type: 'string' } },
                                            launchBrands: { type: 'array', items: { type: 'string' } },
                                            outletBrands: { type: 'array', items: { type: 'string' } },
                                            byGender: { type: 'object' },
                                            sizes: { type: 'array', items: { type: 'string' } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/products/images/upload': {
                post: {
                    tags: ['Produtos'],
                    summary: 'Faz upload local de imagem de produto',
                    security: [{ bearerAuth: [] }, { basicAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['imageData'],
                                    properties: {
                                        imageData: { type: 'string', description: 'Data URL base64 da imagem.' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Imagem enviada' },
                        400: { description: 'Imagem invalida' },
                        401: { description: 'Nao autorizado' },
                    },
                },
            },
            '/api/products/{productId}/reviews': {
                get: {
                    tags: ['Avaliacoes'],
                    summary: 'Lista avaliacoes de um produto',
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Avaliacoes do produto' },
                    },
                },
                post: {
                    tags: ['Avaliacoes'],
                    summary: 'Cria avaliacao do produto pelo usuario logado',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['rating'],
                                    properties: {
                                        rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                                        comment: { type: 'string', example: 'Produto muito bom.' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Avaliacao criada' },
                        400: { description: 'Dados invalidos' },
                    },
                },
            },
            '/api/products/{productId}/rating': {
                get: {
                    tags: ['Avaliacoes'],
                    summary: 'Retorna media e quantidade real de avaliacoes',
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Resumo de avaliacoes' },
                    },
                },
            },
            '/api/reviews/{reviewId}': {
                delete: {
                    tags: ['Avaliacoes'],
                    summary: 'Remove avaliacao do usuario logado',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'reviewId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Avaliacao removida' },
                        403: { description: 'Nao autorizado' },
                    },
                },
            },
            '/api/cart': {
                get: {
                    tags: ['Carrinho'],
                    summary: 'Lista o carrinho persistido do usuario logado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Carrinho carregado',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/PersistedCartResponse' },
                                },
                            },
                        },
                    },
                },
                post: {
                    tags: ['Carrinho'],
                    summary: 'Calcula subtotal, frete, cupom e total sem criar pedido',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CheckoutRequest' },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Resumo calculado', content: { 'application/json': { schema: { $ref: '#/components/schemas/CartSummary' } } } },
                        400: { description: 'Carrinho invalido' },
                    },
                },
                delete: {
                    tags: ['Carrinho'],
                    summary: 'Limpa o carrinho persistido do usuario logado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Carrinho limpo',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/PersistedCartResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/api/cart/items': {
                put: {
                    tags: ['Carrinho'],
                    summary: 'Cria ou atualiza um item do carrinho persistido',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CartItem' },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Carrinho atualizado',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/PersistedCartResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/api/cart/items/{productId}': {
                delete: {
                    tags: ['Carrinho'],
                    summary: 'Remove um produto do carrinho persistido',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                        { name: 'size', in: 'query', required: false, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: {
                            description: 'Item removido',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/PersistedCartResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/api/payments/checkout': {
                post: {
                    tags: ['Pagamentos'],
                    summary: 'Cria um pedido com precificacao recalculada no backend',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CheckoutRequest' },
                            },
                        },
                    },
                    responses: {
                        201: {
                            description: 'Pedido criado aguardando pagamento',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CheckoutResponse' },
                                },
                            },
                        },
                        400: { description: 'Carrinho invalido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Token ausente ou invalido' },
                    },
                },
            },
            '/api/payments/pix-preview': {
                post: {
                    tags: ['Pagamentos'],
                    summary: 'Gera previa do Pix com valor final sem criar pedido',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CheckoutRequest' },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Pix de previa gerado', content: { 'application/json': { schema: { $ref: '#/components/schemas/PixInfo' } } } },
                        400: { description: 'Sem itens para gerar Pix' },
                    },
                },
            },
            '/api/payments/pix/{orderId}': {
                get: {
                    tags: ['Pagamentos'],
                    summary: 'Gera QR Code e Pix copia e cola com o valor final do pedido',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Pix gerado', content: { 'application/json': { schema: { $ref: '#/components/schemas/PixInfo' } } } },
                        403: { description: 'Usuario nao e dono do pedido' },
                        404: { description: 'Pedido nao encontrado' },
                    },
                },
            },
            '/api/payments/confirm': {
                post: {
                    tags: ['Pagamentos', 'Admin'],
                    summary: 'Confirma pagamento manualmente no painel admin',
                    description: 'Uso restrito a administradores. Webhook real deve usar rota propria.',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['orderId'],
                                    properties: { orderId: { type: 'integer', example: 52 } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Pagamento confirmado e pedido movido para processando' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/orders': {
                post: {
                    tags: ['Pedidos'],
                    summary: 'Cria pedido pela rota legada com recalculo no backend',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CheckoutRequest' },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Pedido criado' },
                        400: { description: 'Dados invalidos' },
                    },
                },
            },
            '/api/orders/my-orders': {
                get: {
                    tags: ['Pedidos'],
                    summary: 'Lista pedidos do usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Lista de pedidos do usuario',
                            content: {
                                'application/json': {
                                    schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                                },
                            },
                        },
                    },
                },
            },
            '/api/orders/pending/cancel-all': {
                delete: {
                    tags: ['Pedidos', 'Admin'],
                    summary: 'Cancela pedidos pendentes/aguardando pagamento',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Pedidos cancelados' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/orders/cancelled/delete-all': {
                delete: {
                    tags: ['Pedidos', 'Admin'],
                    summary: 'Remove pedidos cancelados quando permitido',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Pedidos removidos' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/orders/{id}': {
                get: {
                    tags: ['Pedidos'],
                    summary: 'Detalha um pedido do usuario ou do admin',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Pedido encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
                        403: { description: 'Nao autorizado' },
                        404: { description: 'Pedido nao encontrado' },
                    },
                },
                delete: {
                    tags: ['Pedidos'],
                    summary: 'Remove pedido quando a regra de negocio permitir',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Pedido removido' },
                        403: { description: 'Nao autorizado' },
                    },
                },
            },
            '/api/orders/admin/all': {
                get: {
                    tags: ['Pedidos', 'Admin'],
                    summary: 'Lista pedidos no painel administrativo com paginacao',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'status', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Pedidos paginados' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/orders/{id}/status': {
                patch: {
                    tags: ['Pedidos', 'Admin'],
                    summary: 'Atualiza o status de um pedido',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status'],
                                    properties: {
                                        status: {
                                            type: 'string',
                                            enum: ['aguardando_pagamento', 'processando', 'enviado', 'entregue', 'cancelado'],
                                            example: 'enviado',
                                        },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Status atualizado' },
                        400: { description: 'Status invalido' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/orders/{id}/cancel': {
                delete: {
                    tags: ['Pedidos'],
                    summary: 'Cancela pedido do usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Pedido cancelado' },
                        403: { description: 'Nao autorizado' },
                    },
                },
            },
            '/api/wishlist': {
                get: {
                    tags: ['Wishlist'],
                    summary: 'Lista produtos favoritos do usuario',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Favoritos',
                            content: {
                                'application/json': {
                                    schema: { type: 'array', items: { $ref: '#/components/schemas/WishlistItem' } },
                                },
                            },
                        },
                    },
                },
            },
            '/api/wishlist/add': {
                post: {
                    tags: ['Wishlist'],
                    summary: 'Adiciona produto aos favoritos',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['productId'],
                                    properties: { productId: { type: 'integer', example: 12 } },
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Produto favoritado' },
                        409: { description: 'Produto ja estava favoritado' },
                    },
                },
            },
            '/api/wishlist/{productId}': {
                delete: {
                    tags: ['Wishlist'],
                    summary: 'Remove produto dos favoritos',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Favorito removido' },
                        404: { description: 'Favorito nao encontrado' },
                    },
                },
            },
            '/api/wishlist/check': {
                get: {
                    tags: ['Wishlist'],
                    summary: 'Verifica varios favoritos em lote',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'ids', in: 'query', required: true, schema: { type: 'string', example: '1,2,3' } },
                    ],
                    responses: {
                        200: { description: 'Mapa/lista de favoritos do usuario' },
                    },
                },
            },
            '/api/wishlist/check/{productId}': {
                get: {
                    tags: ['Wishlist'],
                    summary: 'Verifica se um produto esta nos favoritos',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'productId', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Resultado da verificacao' },
                    },
                },
            },
            '/api/wishlist/count/total': {
                get: {
                    tags: ['Wishlist'],
                    summary: 'Conta favoritos do usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Total de favoritos',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { count: { type: 'integer', example: 2 } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/addresses': {
                get: {
                    tags: ['Enderecos'],
                    summary: 'Lista enderecos do usuario',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Enderecos cadastrados',
                            content: {
                                'application/json': {
                                    schema: { type: 'array', items: { $ref: '#/components/schemas/Address' } },
                                },
                            },
                        },
                    },
                },
                post: {
                    tags: ['Enderecos'],
                    summary: 'Cria novo endereco',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Address' } } },
                    },
                    responses: {
                        201: { description: 'Endereco criado' },
                        400: { description: 'Dados invalidos' },
                    },
                },
            },
            '/api/addresses/{id}': {
                put: {
                    tags: ['Enderecos'],
                    summary: 'Atualiza endereco',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Address' } } },
                    },
                    responses: {
                        200: { description: 'Endereco atualizado' },
                        404: { description: 'Endereco nao encontrado' },
                    },
                },
                delete: {
                    tags: ['Enderecos'],
                    summary: 'Remove endereco',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Endereco removido' },
                        404: { description: 'Endereco nao encontrado' },
                    },
                },
            },
            '/api/addresses/{id}/default': {
                patch: {
                    tags: ['Enderecos'],
                    summary: 'Define endereco como padrao',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Endereco definido como padrao' },
                    },
                },
            },
            '/api/admin/session': {
                get: {
                    tags: ['Admin'],
                    summary: 'Valida sessao do painel admin',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Sessao valida', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminSession' } } } },
                        401: { description: 'Token invalido' },
                    },
                },
            },
            '/api/admin/users': {
                get: {
                    tags: ['Admin'],
                    summary: 'Lista administradores',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Administradores cadastrados' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
                post: {
                    tags: ['Admin'],
                    summary: 'Cria administrador ou superadmin',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'email', 'password'],
                                    properties: {
                                        name: { type: 'string', example: 'Novo Admin' },
                                        email: { type: 'string', example: 'admin2@tenis.com' },
                                        password: { type: 'string', example: 'SenhaForte123' },
                                        role: { type: 'string', enum: ['admin', 'superadmin'], example: 'admin' },
                                        isSuperAdmin: { type: 'boolean', example: false },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Administrador criado' },
                        403: { description: 'Apenas superadmin pode criar administradores' },
                    },
                },
            },
            '/api/admin/users/{id}': {
                put: {
                    tags: ['Admin'],
                    summary: 'Atualiza administrador ou superadmin',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'email', 'role'],
                                    properties: {
                                        name: { type: 'string', example: 'Administrador Atualizado' },
                                        email: { type: 'string', example: 'admin@tenis.com' },
                                        password: { type: 'string', description: 'Opcional. Deixe ausente para manter a senha atual.' },
                                        role: { type: 'string', enum: ['admin', 'superadmin'], example: 'admin' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Administrador atualizado' },
                        403: { description: 'Apenas superadmin pode editar administradores' },
                        409: { description: 'Email ja cadastrado' },
                    },
                },
                delete: {
                    tags: ['Admin'],
                    summary: 'Remove administrador',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Administrador removido' },
                        403: { description: 'Apenas superadmin pode remover administradores' },
                    },
                },
            },
            '/api/reports/summary': {
                get: {
                    tags: ['Relatorios'],
                    summary: 'Resumo de vendas para administradores',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Resumo de vendas' },
                        403: { description: 'Apenas administradores podem acessar relatorios' },
                    },
                },
            },
            '/api/reports/top-products': {
                get: {
                    tags: ['Relatorios'],
                    summary: 'Produtos mais vendidos no periodo',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Ranking de produtos' },
                        403: { description: 'Apenas administradores podem acessar relatorios' },
                    },
                },
            },
            '/api/reports/monthly-sales': {
                get: {
                    tags: ['Relatorios'],
                    summary: 'Vendas agrupadas por mes',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Vendas mensais' },
                        403: { description: 'Apenas administradores podem acessar relatorios' },
                    },
                },
            },
            '/api/reports/full': {
                get: {
                    tags: ['Relatorios'],
                    summary: 'Relatorio completo do dashboard administrativo',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Resumo, produtos mais vendidos e vendas mensais' },
                        403: { description: 'Apenas administradores podem acessar relatorios' },
                    },
                },
            },
            '/api/admin-reports/pending-orders': {
                get: {
                    tags: ['Admin', 'Relatorios'],
                    summary: 'Lista pedidos aguardando pagamento no painel',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Pedidos pendentes' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/admin-reports/order-notifications': {
                get: {
                    tags: ['Admin'],
                    summary: 'Retorna notificacoes de pedidos que precisam de atencao',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Contadores de pedidos por status operacional' },
                    },
                },
            },
            '/api/admin-reports/order-status-summary': {
                get: {
                    tags: ['Admin', 'Relatorios'],
                    summary: 'Resumo de pedidos por status',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Contadores por status' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/admin-reports/customers': {
                get: {
                    tags: ['Admin', 'Relatorios'],
                    summary: 'Relatorio de clientes com total de pedidos e valor gasto',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Relatorio de clientes' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/admin-reports/low-stock': {
                get: {
                    tags: ['Admin'],
                    summary: 'Lista produtos com estoque baixo por severidade',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Produtos ordenados por menor estoque' },
                    },
                },
            },
            '/api/admin-reports/pix-transactions': {
                get: {
                    tags: ['Admin', 'Relatorios', 'Pagamentos'],
                    summary: 'Lista transacoes Pix e estatisticas',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: { description: 'Transacoes Pix paginadas' },
                        403: { description: 'Acesso restrito a administradores' },
                    },
                },
            },
            '/api/newsletter': {
                post: {
                    tags: ['Newsletter'],
                    summary: 'Inscreve email para receber promocoes',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email'],
                                    properties: { email: { type: 'string', example: 'cliente@email.com' } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Inscricao criada, reativada ou ja existente' },
                        400: { description: 'Email invalido' },
                    },
                },
            },
            '/api/newsletter/subscribers': {
                get: {
                    tags: ['Newsletter', 'Admin'],
                    summary: 'Lista inscritos da newsletter',
                    security: [{ bearerAuth: [] }, { basicAuth: [] }],
                    responses: {
                        200: { description: 'Inscritos cadastrados' },
                        401: { description: 'Nao autorizado' },
                    },
                },
            },
            '/api/newsletter/subscribers/{id}': {
                patch: {
                    tags: ['Newsletter', 'Admin'],
                    summary: 'Ativa ou desativa inscrito da newsletter',
                    security: [{ bearerAuth: [] }, { basicAuth: [] }],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['active'],
                                    properties: { active: { type: 'boolean', example: true } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Inscrito atualizado' },
                        404: { description: 'Inscrito nao encontrado' },
                    },
                },
            },
            '/api/newsletter/promotion/test': {
                post: {
                    tags: ['Newsletter', 'Admin'],
                    summary: 'Envia email de teste de promocao',
                    security: [{ bearerAuth: [] }, { basicAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['subject', 'title', 'message'],
                                    properties: {
                                        subject: { type: 'string', example: 'Oferta Prime Sneaker' },
                                        title: { type: 'string', example: 'Promocao especial' },
                                        message: { type: 'string', example: 'Confira as novidades da loja.' },
                                        couponCode: { type: 'string', example: 'URI10' },
                                        testEmail: { type: 'string', example: 'admin@tenis.com' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Email de teste enviado' },
                        400: { description: 'Dados invalidos' },
                    },
                },
            },
            '/api/newsletter/promotion': {
                post: {
                    tags: ['Newsletter', 'Admin'],
                    summary: 'Envia promocao para inscritos ativos',
                    security: [{ bearerAuth: [] }, { basicAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['subject', 'title', 'message'],
                                    properties: {
                                        subject: { type: 'string', example: 'Oferta Prime Sneaker' },
                                        title: { type: 'string', example: 'Promocao especial' },
                                        message: { type: 'string', example: 'Confira as novidades da loja.' },
                                        couponCode: { type: 'string', example: 'URI10' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Promocao enviada' },
                        400: { description: 'Nenhum inscrito ativo ou dados invalidos' },
                    },
                },
            },
            '/api/admin-audit-logs': {
                get: {
                    tags: ['Admin'],
                    summary: 'Lista auditoria administrativa com filtros',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'admin', in: 'query', schema: { type: 'string' } },
                        { name: 'action', in: 'query', schema: { type: 'string' } },
                        { name: 'target', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: {
                        200: {
                            description: 'Logs de auditoria',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/AdminAuditLog' },
                                    },
                                },
                            },
                        },
                        403: { description: 'Apenas superadmin pode consultar auditoria' },
                    },
                },
            },
        },
    },
    apis: [
        './src/routes/*.js',
    ],
};

module.exports = swaggerJsdoc(options);
