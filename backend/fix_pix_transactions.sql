-- Garante a tabela pix_transactions e preenche retroativamente
-- a partir dos pedidos existentes, para que o dashboard mostre as compras antigas.

-- 1. Cria a tabela se ainda nao existir
CREATE TABLE IF NOT EXISTS pix_transactions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insere uma transacao PIX para cada pedido que ainda nao tem
INSERT INTO pix_transactions (order_id, user_id, amount, status, created_at)
SELECT o.id, o.user_id, o.total,
       CASE
           WHEN o.status = 'aguardando_pagamento' THEN 'pending'
           WHEN o.status = 'cancelado' THEN 'cancelled'
           ELSE 'confirmed'
       END,
       o.created_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM pix_transactions pt WHERE pt.order_id = o.id
);

-- 3. Sincroniza status: se o pedido virou processando/enviado/entregue,
-- a transacao PIX precisa estar como 'confirmed'
UPDATE pix_transactions pt
SET status = 'confirmed'
FROM orders o
WHERE pt.order_id = o.id
  AND pt.status <> 'confirmed'
  AND o.status IN ('processando', 'enviado', 'entregue');
