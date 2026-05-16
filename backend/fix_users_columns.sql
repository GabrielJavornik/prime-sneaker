-- Adiciona colunas faltantes na tabela users
-- Seguro: so adiciona se ainda nao existir
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cep VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Garante que updated_at tenha valor para registros existentes
UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
