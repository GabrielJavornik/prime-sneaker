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

-- Migração: Popular a tabela com os dados existentes
INSERT INTO product_sizes (product_id, size, stock)
SELECT
    p.id,
    TRIM(unnest(string_to_array(p.sizes, ','))) as size,
    p.stock
FROM products p
WHERE p.sizes IS NOT NULL AND p.sizes != ''
ON CONFLICT (product_id, size) DO NOTHING;
