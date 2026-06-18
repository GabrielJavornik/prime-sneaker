-- =============================================================
-- Script de criacao do banco de dados e tabelas
-- Banco: PostgreSQL
-- =============================================================

-- Execute em um banco que nao seja o 'prime_sneaker_db' para criar o DB:
-- CREATE DATABASE prime_sneaker_db;

-- Conecte-se ao banco 'prime_sneaker_db' antes de rodar o restante:

-- Tabela de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    cpf VARCHAR(20),
    is_admin BOOLEAN DEFAULT FALSE,
    is_super_admin BOOLEAN DEFAULT FALSE,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de auditoria administrativa
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_name VARCHAR(120),
    admin_email VARCHAR(120),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id INTEGER,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- Tabela de produtos (tenis)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    image_url TEXT,
    sizes VARCHAR(100),      -- ex: "38,39,40,41,42"
    color VARCHAR(80),
    model_group VARCHAR(120), -- agrupa o mesmo modelo em cores diferentes
    category VARCHAR(80),    -- ex: "running", "casual", "basquete"
    brand VARCHAR(80),
    gender VARCHAR(20) DEFAULT 'unissex',
    is_launch BOOLEAN DEFAULT FALSE,
    is_outlet BOOLEAN DEFAULT FALSE,
    discount_percent NUMERIC(5, 2) DEFAULT 0,
    stock INTEGER DEFAULT 10,
    archived_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar estoque por tamanho
CREATE TABLE IF NOT EXISTS product_sizes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(10) NOT NULL,
    stock INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, size)
);

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_product_sizes_product_id ON product_sizes(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_lower ON products (LOWER(category));
CREATE INDEX IF NOT EXISTS idx_products_brand_lower ON products (LOWER(brand));
CREATE INDEX IF NOT EXISTS idx_products_model_group_lower ON products (LOWER(model_group));
CREATE INDEX IF NOT EXISTS idx_products_gender_lower ON products (LOWER(gender));
CREATE INDEX IF NOT EXISTS idx_products_launch ON products (is_launch);
CREATE INDEX IF NOT EXISTS idx_products_outlet ON products (is_outlet);
CREATE INDEX IF NOT EXISTS idx_products_archived_at ON products (archived_at);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);

-- Tabela de cupons
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(40) UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
    min_value NUMERIC(10, 2) DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de inscritos na newsletter/promocoes
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(120) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de pedidos
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subtotal NUMERIC(10, 2) NOT NULL,
    shipping NUMERIC(10, 2) DEFAULT 25.00,
    shipping_address JSONB DEFAULT '{}'::jsonb,
    discount NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL,
    coupon_code VARCHAR(40),
    status VARCHAR(50) DEFAULT 'aguardando_pagamento',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens do pedido
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name VARCHAR(150) NOT NULL,
    product_price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    size VARCHAR(10),
    line_total NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de avaliacoes de produtos
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Tabela de favoritos (wishlist)
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Tabela de carrinho persistido por usuario
CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(10) NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id, size)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);

-- Tabela de galeria de imagens por produto
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- Dados iniciais para teste (seed)
-- =============================================================

-- Usuario admin (senha em texto plano sera trocada por hash no seed do initDb.js)
-- Este INSERT serve apenas se rodar manualmente:
-- INSERT INTO users (name, email, password, is_admin, is_super_admin) VALUES
-- ('Super Administrador', 'admin@tenis.com', '$2a$10$hash_here', true, true);

-- Produtos de exemplo
INSERT INTO products (name, description, price, image_url, sizes, color, category, brand, gender, is_launch, is_outlet, discount_percent, stock) VALUES
('Nike Air Max 90', 'Tenis classico com amortecimento visivel na entressola e estilo atemporal.', 599.90, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600', '38,39,40,41,42,43', 'Vermelho', 'casual', 'Nike', 'masculino', TRUE, FALSE, 0, 20),
('Adidas Ultraboost 22', 'Tenis de corrida com tecnologia Boost para maximo retorno de energia.', 899.00, 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600', '39,40,41,42,43,44', 'Preto', 'esportivo', 'Adidas', 'masculino', TRUE, FALSE, 0, 15),
('Puma RS-X', 'Design retro dos anos 80 reinventado com cores vibrantes.', 499.90, 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600', '37,38,39,40,41,42', 'Branco', 'casual', 'Puma', 'feminino', FALSE, TRUE, 20, 25),
('Nike Jordan 1 Mid', 'Icone do basquete e da cultura streetwear com visual classico.', 1099.00, 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600', '39,40,41,42,43,44', 'Vermelho/Preto', 'esportivo', 'Jordan', 'masculino', TRUE, FALSE, 0, 10),
('Mizuno Wave Prophecy', 'Tenis premium para corrida com tecnologia Infinity Wave.', 1499.00, 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600', '39,40,41,42,43', 'Azul', 'esportivo', 'Mizuno', 'masculino', FALSE, FALSE, 0, 8),
('Tenis Nike Run Swift 3', 'Sinta o melhor da Nike em todos os detalhes do Run Swift 3, com suporte leve e conforto para a rotina.', 599.99, 'https://imgcentauro-a.akamaihd.net/1024x1024/9850370CA2.jpg', '39,40,41,42', 'Branco/Laranja', 'esportivo', 'Nike', 'infantil', TRUE, FALSE, 0, 34),
('Tenis Nike Run Swift 3', 'Sinta o melhor da Nike em todos os detalhes do Run Swift 3, com suporte leve e conforto para a rotina.', 559.99, 'https://imgcentauro-a.akamaihd.net/1024x1024/M0XAPW31A2.jpg', '39,40,41', 'Preto/Branco', 'esportivo', 'Nike', 'infantil', FALSE, FALSE, 0, 60);

-- Cupom de exemplo
INSERT INTO coupons (code, discount_percent, active, expires_at, max_uses) VALUES
('URI10', 10, TRUE, NULL, NULL),
('PROMO20', 20, TRUE, NOW() + INTERVAL '30 days', 50);

-- Migração: Popular product_sizes com os dados existentes
INSERT INTO product_sizes (product_id, size, stock)
SELECT
    p.id,
    TRIM(unnest(string_to_array(p.sizes, ','))) as size,
    p.stock
FROM products p
WHERE p.sizes IS NOT NULL AND p.sizes != ''
ON CONFLICT (product_id, size) DO NOTHING;
