/**
 * @swagger
 * tags:
 *   name: Produtos
 *   description: CRUD de produtos (tenis)
 */
const express = require('express');
const ProductController = require('../controllers/productController');
const { basicAuthAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/products:
 *   get:
 *     tags: [Produtos]
 *     summary: Lista todos os produtos
 *     responses:
 *       200:
 *         description: Lista de produtos
 */
router.get('/products', ProductController.list);

router.get('/products/facets', ProductController.facets);

/**
 * @swagger
 * /api/products/top:
 *   get:
 *     tags: [Produtos]
 *     summary: Retorna os N produtos mais recentes (padrao 4) - usado na home
 *     parameters:
 *       - in: query
 *         name: n
 *         schema: { type: integer, default: 4 }
 *     responses:
 *       200:
 *         description: Lista de produtos
 */
router.get('/products/top', ProductController.top);

/**
 * @swagger
 * /api/search:
 *   get:
 *     tags: [Produtos]
 *     summary: Busca produtos com filtros e paginacao
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: categoria
 *         schema: { type: string }
 *       - in: query
 *         name: marca
 *         schema: { type: string }
 *       - in: query
 *         name: genero
 *         schema: { type: string, enum: [masculino, feminino, infantil, unissex] }
 *       - in: query
 *         name: lancamento
 *         schema: { type: string, enum: ["1", "true"] }
 *       - in: query
 *         name: outlet
 *         schema: { type: string, enum: ["1", "true"] }
 *       - in: query
 *         name: tamanho
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Produtos paginados
 */
router.get('/search', ProductController.search);

/**
 * @swagger
 * /api/product/{id}:
 *   get:
 *     tags: [Produtos]
 *     summary: Detalha um produto
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Produto encontrado
 *       404:
 *         description: Nao encontrado
 */
router.get('/product/:id', ProductController.getById);

/**
 * @swagger
 * /api/products/{id}/recommended:
 *   get:
 *     tags: [Produtos]
 *     summary: Produtos recomendados baseado em categoria e preco
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de produtos similares
 */
router.get('/products/:id/recommended', ProductController.getRecommended);

/**
 * @swagger
 * /api/products/{id}/size-stock:
 *   get:
 *     tags: [Produtos]
 *     summary: Retorna estoque por tamanho
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estoque por tamanho
 */
router.get('/products/:id/size-stock', ProductController.getSizeStock);

/**
 * @swagger
 * /api/products/{id}/size-stock:
 *   post:
 *     tags: [Produtos]
 *     summary: Atualiza estoque por tamanho (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stocks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     size: { type: string }
 *                     stock: { type: integer }
 *     responses:
 *       200:
 *         description: Estoque atualizado
 *       401:
 *         description: Nao autorizado
 */
router.post('/products/:id/size-stock', basicAuthAdmin, ProductController.updateSizeStock);

/**
 * @swagger
 * /api/products/{id}/images:
 *   get:
 *     tags: [Produtos]
 *     summary: Lista imagens de um produto
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de imagens
 */
router.get('/products/:id/images', ProductController.listImages);

/**
 * @swagger
 * /api/products/{id}/images:
 *   post:
 *     tags: [Produtos]
 *     summary: Adiciona uma imagem ao produto (admin)
 *     security:
 *       - basicAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               image_url: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       201: { description: Imagem adicionada }
 *       401: { description: Nao autorizado }
 */
router.post('/products/:id/images', basicAuthAdmin, ProductController.addImage);

/**
 * @swagger
 * /api/products/images/{imageId}:
 *   delete:
 *     tags: [Produtos]
 *     summary: Remove uma imagem (admin)
 *     security:
 *       - basicAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Removido }
 *       401: { description: Nao autorizado }
 */
router.delete('/products/images/:imageId', basicAuthAdmin, ProductController.deleteImage);

router.post('/products/images/upload', basicAuthAdmin, ProductController.uploadImage);

/**
 * @swagger
 * /api/products:
 *   post:
 *     tags: [Produtos]
 *     summary: Cadastra um novo produto (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Produto criado
 *       401:
 *         description: Nao autorizado
 */
router.post('/products', basicAuthAdmin, ProductController.create);

/**
 * @swagger
 * /api/product/{id}:
 *   put:
 *     tags: [Produtos]
 *     summary: Atualiza um produto (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Atualizado }
 *       401: { description: Nao autorizado }
 *       404: { description: Nao encontrado }
 */
router.put('/product/:id', basicAuthAdmin, ProductController.update);

/**
 * @swagger
 * /api/product/{id}:
 *   delete:
 *     tags: [Produtos]
 *     summary: Exclui um produto (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Excluido }
 *       401: { description: Nao autorizado }
 *       404: { description: Nao encontrado }
 */
router.delete('/product/:id', basicAuthAdmin, ProductController.remove);

module.exports = router;
