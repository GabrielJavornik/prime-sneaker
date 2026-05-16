-- Script para adicionar as colunas de recuperação de senha à tabela users
-- Execute isso em seu banco PostgreSQL:

ALTER TABLE users
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
