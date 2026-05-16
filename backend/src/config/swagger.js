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
                        category: { type: 'string', example: 'casual' },
                        stock: { type: 'integer', example: 20 },
                    },
                },
                CartItem: {
                    type: 'object',
                    properties: {
                        productId: { type: 'integer' },
                        quantity: { type: 'integer' },
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
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        status: { type: 'integer' },
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
