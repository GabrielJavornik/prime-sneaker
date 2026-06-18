/**
 * Newsletter routes.
 */
const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const validators = require('../utils/validators');
const db = require('../config/database');
const { basicAuthAdmin } = require('../middlewares/authMiddleware');
const { logAdminAction } = require('../services/auditService');

function normalizePromotionPayload(body = {}) {
    const subject = String(body.subject || '').trim();
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    const couponCode = String(body.couponCode || '').trim().toUpperCase();

    return { subject, title, message, couponCode };
}

function validatePromotionPayload(payload) {
    return Boolean(payload.subject && payload.title && payload.message);
}

router.post('/newsletter', async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string' || !validators.isValidEmail(email)) {
            return res.status(400).json({
                error: 'Email invalido',
                status: 400,
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existing = await db.query(
            `SELECT id, active
             FROM newsletter_subscribers
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (existing.rows[0]?.active) {
            return res.status(200).json({
                status: 'already_subscribed',
                message: 'Inscricao ja feita. Voce ja recebera os emails das promocoes.',
            });
        }

        if (existing.rows[0]) {
            await db.query(
                `UPDATE newsletter_subscribers
                 SET active = TRUE
                 WHERE email = $1`,
                [normalizedEmail]
            );

            return res.status(200).json({
                status: 'reactivated',
                message: 'Inscricao reativada. Voce recebera os emails das promocoes.',
            });
        }

        try {
            await db.query(
                `INSERT INTO newsletter_subscribers (email, active)
                 VALUES ($1, TRUE)`,
                [normalizedEmail]
            );
        } catch (err) {
            if (err.code === '23505') {
                return res.status(200).json({
                    status: 'already_subscribed',
                    message: 'Inscricao ja feita. Voce ja recebera os emails das promocoes.',
                });
            }
            throw err;
        }

        res.status(200).json({
            status: 'subscribed',
            message: 'Inscricao realizada com sucesso! Verifique seu email.',
        });

        emailService.sendNewsletterWelcome(normalizedEmail).catch(err => {
            console.error(`[NEWSLETTER] Erro ao enviar boas-vindas para ${normalizedEmail}:`, err.message);
        });
    } catch (err) {
        next(err);
    }
});

router.get('/newsletter/subscribers', basicAuthAdmin, async (req, res, next) => {
    try {
        const result = await db.query(
            `SELECT id, email, active, created_at
             FROM newsletter_subscribers
             ORDER BY created_at DESC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.patch('/newsletter/subscribers/:id', basicAuthAdmin, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const active = Boolean(req.body.active);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: 'Inscrito invalido',
                status: 400,
            });
        }

        const result = await db.query(
            `UPDATE newsletter_subscribers
             SET active = $1
             WHERE id = $2
             RETURNING id, email, active, created_at`,
            [active, id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({
                error: 'Inscrito nao encontrado',
                status: 404,
            });
        }

        await logAdminAction(req, {
            action: active ? 'newsletter.subscriber.activate' : 'newsletter.subscriber.deactivate',
            entityType: 'newsletter_subscriber',
            entityId: id,
            details: {
                email: result.rows[0].email,
                active,
            },
        });

        res.status(200).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.post('/newsletter/promotion/test', basicAuthAdmin, async (req, res, next) => {
    try {
        const payload = normalizePromotionPayload(req.body);
        const targetEmail = String(req.body.testEmail || req.user?.email || '').trim().toLowerCase();

        if (!validatePromotionPayload(payload)) {
            return res.status(400).json({
                error: 'Assunto, titulo e mensagem sao obrigatorios',
                status: 400,
            });
        }

        if (!validators.isValidEmail(targetEmail)) {
            return res.status(400).json({
                error: 'Informe um email valido para receber o teste',
                status: 400,
            });
        }

        const ok = await emailService.sendPromotionEmail(targetEmail, payload);

        if (!ok) {
            return res.status(500).json({
                error: 'Nao foi possivel enviar o email de teste',
                status: 500,
            });
        }

        await logAdminAction(req, {
            action: 'newsletter.promotion.test',
            entityType: 'newsletter',
            entityId: null,
            details: {
                subject: payload.subject,
                title: payload.title,
                couponCode: payload.couponCode,
                testEmail: targetEmail,
            },
        });

        res.status(200).json({
            message: 'Email de teste enviado',
            sent: 1,
            email: targetEmail,
        });
    } catch (err) {
        next(err);
    }
});

router.post('/newsletter/promotion', basicAuthAdmin, async (req, res, next) => {
    try {
        const payload = normalizePromotionPayload(req.body);

        if (!validatePromotionPayload(payload)) {
            return res.status(400).json({
                error: 'Assunto, titulo e mensagem sao obrigatorios',
                status: 400,
            });
        }

        const result = await db.query(
            `SELECT email
             FROM newsletter_subscribers
             WHERE active = TRUE
             ORDER BY created_at DESC`
        );
        const emails = result.rows.map(row => row.email);

        if (emails.length === 0) {
            return res.status(400).json({
                error: 'Nenhum inscrito ativo para receber a promocao',
                status: 400,
            });
        }

        let sent = 0;
        let failed = 0;

        for (const email of emails) {
            const ok = await emailService.sendPromotionEmail(email, payload);
            if (ok) sent++;
            else failed++;
        }

        await logAdminAction(req, {
            action: 'newsletter.promotion.send',
            entityType: 'newsletter',
            entityId: null,
            details: {
                subject: payload.subject,
                title: payload.title,
                couponCode: payload.couponCode,
                sent,
                failed,
            },
        });

        res.status(200).json({
            message: 'Promocao enviada',
            sent,
            failed,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
