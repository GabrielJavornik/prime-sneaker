const nodemailer = require('nodemailer');
const { ORDER_STATUS, normalizeOrderStatus } = require('./orderStatusService');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function escapeEmailHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const emailService = {
    async sendPromotionEmail(email, { subject, title, message, couponCode }) {
        try {
            const safeSubject = String(subject || '').trim();
            const safeTitle = escapeEmailHtml(title);
            const safeMessage = escapeEmailHtml(message).replace(/\r?\n/g, '<br>');
            const safeCouponCode = escapeEmailHtml(String(couponCode || '').trim().toUpperCase());
            const couponHtml = safeCouponCode ? `
                <div style="background:#111; color:#f0c040; padding:18px; border-radius:8px; text-align:center; margin:20px 0;">
                    <div style="font-size:13px; text-transform:uppercase; letter-spacing:1px;">Cupom exclusivo</div>
                    <div style="font-size:28px; font-weight:bold; margin-top:6px;">${safeCouponCode}</div>
                </div>
            ` : '';

            await transporter.sendMail({
                from: `"Prime Sneaker" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: safeSubject,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #222;">
                        <div style="background:#111; padding:22px; text-align:center;">
                            <h1 style="color:#f0c040; margin:0;">Prime Sneaker</h1>
                        </div>
                        <div style="padding:28px; background:#fff;">
                            <h2 style="margin-top:0; color:#111;">${safeTitle}</h2>
                            <p style="font-size:16px; line-height:1.7; color:#444;">${safeMessage}</p>
                            ${couponHtml}
                            <a href="${process.env.APP_URL || 'http://localhost:3000'}/search.html"
                               style="display:inline-block; background:#d6a829; color:#111; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:bold;">
                                Ver produtos
                            </a>
                        </div>
                        <div style="background:#f5f5f5; padding:16px; font-size:12px; color:#666; text-align:center;">
                            Voce recebeu este email porque se cadastrou para receber promocoes da Prime Sneaker.
                        </div>
                    </div>
                `,
                text: `${title}\n\n${message}${safeCouponCode ? `\n\nCupom: ${safeCouponCode}` : ''}`,
            });

            return true;
        } catch (err) {
            console.error(`Erro ao enviar promocao para ${email}:`, err.message);
            return false;
        }
    },

    async sendOrderConfirmation(order, user, items) {
        try {
            const htmlContent = this.getOrderEmailTemplate(order, user, items);

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: `🎉 Pedido Confirmado #${order.id} - Prime Sneaker`,
                html: this.getOrderEmailHTML(order, user, items),
                text: htmlContent,
            });

            console.log(`✅ Email de confirmação enviado para ${user.email}`);
            return true;
        } catch (err) {
            console.error(`❌ Erro ao enviar email para ${user.email}:`, err.message);
            return false;
        }
    },

    async sendOrderNotificationToAdmin(order, user, items) {
        try {
            const adminEmail = '093278@aluno.uricer.edu.br';
            const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
            const adminPanelUrl = `${baseUrl}/admin`;
            const itemsHTML = items
                .map(item => `<li>${item.name} (${item.quantity}x) - R$ ${item.lineTotal.toFixed(2)}</li>`)
                .join('');

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: adminEmail,
                subject: `🔔 Novo Pedido #${order.id} - Prime Sneaker`,
                html: `
                    <h2>Novo Pedido Recebido!</h2>
                    <p><strong>Pedido #${order.id}</strong> de <strong>${user.name}</strong></p>

                    <h3>Informações do Cliente:</h3>
                    <ul>
                        <li><strong>Nome:</strong> ${user.name}</li>
                        <li><strong>Email:</strong> ${user.email}</li>
                        <li><strong>Telefone:</strong> ${user.phone || 'N/A'}</li>
                    </ul>

                    <h3>Itens do Pedido:</h3>
                    <ul>
                        ${itemsHTML}
                    </ul>

                    <h3>Resumo Financeiro:</h3>
                    <ul>
                        <li><strong>Subtotal:</strong> R$ ${order.subtotal.toFixed(2)}</li>
                        <li><strong>Frete:</strong> R$ ${order.shipping.toFixed(2)}</li>
                        <li><strong>Desconto:</strong> R$ ${order.discount.toFixed(2)}</li>
                        <li><strong>TOTAL:</strong> R$ ${order.total.toFixed(2)}</li>
                    </ul>

                    <h3>Status do Pedido:</h3>
                    <p><strong>${order.status.toUpperCase()}</strong></p>
                    <p>Acesse o painel admin para confirmar o pagamento: <a href="${adminPanelUrl}">Painel Admin</a></p>
                `,
                text: `Novo pedido #${order.id} de ${user.name}. Total: R$ ${order.total.toFixed(2)}`,
            });

            console.log(`✅ Notificação de novo pedido enviada para admin`);
            return true;
        } catch (err) {
            console.error(`❌ Erro ao enviar notificação de pedido:`, err.message);
            return false;
        }
    },

    async sendPasswordResetEmail(user, resetToken) {
        try {
            const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
            const resetLink = `${baseUrl}/reset-password.html?token=${resetToken}`;

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: '🔐 Recuperar Senha - Prime Sneaker',
                html: `
                    <h2>Olá ${user.name},</h2>
                    <p>Você solicitou a recuperação de sua senha. Clique no link abaixo para criar uma nova senha:</p>
                    <p><a href="${resetLink}" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                        Recuperar Senha
                    </a></p>
                    <p>Ou copie este link: ${resetLink}</p>
                    <p><strong>Este link expira em 1 hora.</strong></p>
                    <p>Se você não solicitou a recuperação de senha, ignore este email.</p>
                    <hr>
                    <p>Prime Sneaker - Loja de Tenis Premium</p>
                `,
                text: `Clique aqui para recuperar sua senha: ${resetLink}\n\nEste link expira em 1 hora.`,
            });

            console.log(`✅ Email de recuperação de senha enviado para ${user.email}`);
            return true;
        } catch (err) {
            console.error(`❌ Erro ao enviar email de recuperação para ${user.email}:`, err.message);
            return false;
        }
    },

    async sendAdminPasswordResetEmail(user, resetToken) {
        try {
            const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
            const resetLink = `${baseUrl}/admin-reset-password.html?token=${encodeURIComponent(resetToken)}`;
            const safeName = escapeEmailHtml(user.name || 'Administrador');

            await transporter.sendMail({
                from: `"Prime Sneaker" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: 'Recuperacao de senha admin - Prime Sneaker',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #111827;">
                        <div style="background:#0F172A; padding:24px; text-align:center; border-radius:12px 12px 0 0;">
                            <h1 style="color:#D6B23E; margin:0;">Prime Sneaker Admin</h1>
                        </div>
                        <div style="padding:28px; background:#ffffff; border:1px solid #e5e7eb; border-top:0;">
                            <h2 style="margin-top:0;">Recuperacao de acesso</h2>
                            <p>Ola, ${safeName}.</p>
                            <p>Recebemos uma solicitacao para redefinir a senha da sua conta administrativa.</p>
                            <p style="margin:28px 0;">
                                <a href="${resetLink}" style="background:#D6B23E; color:#111827; padding:14px 22px; text-decoration:none; border-radius:10px; font-weight:bold; display:inline-block;">
                                    Redefinir senha admin
                                </a>
                            </p>
                            <p>Este link expira em 1 hora. Se voce nao solicitou, ignore este email.</p>
                            <p style="font-size:13px; color:#64748B; word-break:break-all;">${resetLink}</p>
                        </div>
                    </div>
                `,
                text: `Recuperacao de senha admin Prime Sneaker\n\nAcesse: ${resetLink}\n\nEste link expira em 1 hora.`,
            });

            return true;
        } catch (err) {
            console.error(`Erro ao enviar recuperacao admin para ${user.email}:`, err.message);
            return false;
        }
    },

    getOrderEmailTemplate(order, user, items) {
        const itemsList = items
            .map(item => `• ${item.name} (${item.quantity}x) - R$ ${item.lineTotal.toFixed(2)}`)
            .join('\n');

        return `
╔══════════════════════════════════════════════════════════════════════╗
║                   🎉 PEDIDO CONFIRMADO COM SUCESSO!                  ║
╚══════════════════════════════════════════════════════════════════════╝

Olá ${user.name},

Seu pedido foi recebido e está sendo processado! 🎁

╔═ DETALHES DO PEDIDO ═════════════════════════════════════════════════╗
║
║  📦 Número do Pedido:        #${order.id}
║  📅 Data do Pedido:          ${new Date(order.created_at).toLocaleDateString('pt-BR')}
║  👤 Cliente:                 ${user.name}
║  📧 Email:                   ${user.email}
║
╠═ ITENS PEDIDOS ═════════════════════════════════════════════════════╣
║
${itemsList.split('\n').map(line => '║  ' + (line || '')).join('\n')}
║
╠═ RESUMO FINANCEIRO ═════════════════════════════════════════════════╣
║
║  Subtotal:          R$ ${order.subtotal.toFixed(2)}
║  Frete:             R$ ${order.shipping.toFixed(2)}
║  Desconto:          -R$ ${order.discount.toFixed(2)}
║  ─────────────────────────────────
║  TOTAL:             R$ ${order.total.toFixed(2)}
║
╠═ PRÓXIMOS PASSOS ═══════════════════════════════════════════════════╣
║
║  ✅ Pedido Realizado
║  ⏳ Processando (até 24h)
║  🚚 Será enviado em breve
║  📍 Acompanhe o status no seu perfil
║
╠═ RASTREAMENTO ═════════════════════════════════════════════════════╣
║
║  Acesse sua conta em: https://localhost:3000/orders.html
║  Para acompanhar o status do seu pedido em tempo real!
║
╠═ DÚVIDAS? ══════════════════════════════════════════════════════════╣
║
║  📞 Contato: contato@primesneaker.com
║  💬 Chat: Em breve disponível no site
║  📲 WhatsApp: (34) 99999-9999
║
╚══════════════════════════════════════════════════════════════════════╝

Obrigado por comprar na Prime Sneaker! 👟

Com ❤️,
Time Prime Sneaker
`;
    },

    getOrderEmailHTML(order, user, items) {
        const itemsHTML = items
            .map(item => `<li>${item.name} (${item.quantity}x) - R$ ${item.lineTotal.toFixed(2)}</li>`)
            .join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .section { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; }
                .section h3 { margin-top: 0; color: #667eea; }
                .item-list { list-style: none; padding-left: 0; }
                .item-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
                .summary { background: #f0f0f0; padding: 15px; border-radius: 4px; margin: 10px 0; }
                .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
                .total { font-weight: bold; font-size: 18px; color: #667eea; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
                .footer { background: #333; color: white; text-align: center; padding: 20px; border-radius: 0 0 8px 8px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Pedido Confirmado com Sucesso!</h1>
                </div>
                <div class="content">
                    <p>Olá <strong>${user.name}</strong>,</p>
                    <p>Seu pedido foi recebido e está sendo processado! 🎁</p>

                    <div class="section">
                        <h3>📦 Detalhes do Pedido</h3>
                        <div><strong>Número:</strong> #${order.id}</div>
                        <div><strong>Data:</strong> ${new Date(order.created_at).toLocaleDateString('pt-BR')}</div>
                        <div><strong>Status:</strong> ⏳ Processando</div>
                    </div>

                    <div class="section">
                        <h3>📋 Itens do Pedido</h3>
                        <ul class="item-list">
                            ${itemsHTML}
                        </ul>
                    </div>

                    <div class="section">
                        <h3>💰 Resumo Financeiro</h3>
                        <div class="summary">
                            <div class="summary-row">
                                <span>Subtotal:</span>
                                <span>R$ ${order.subtotal.toFixed(2)}</span>
                            </div>
                            <div class="summary-row">
                                <span>Frete:</span>
                                <span>R$ ${order.shipping.toFixed(2)}</span>
                            </div>
                            <div class="summary-row">
                                <span>Desconto:</span>
                                <span>-R$ ${order.discount.toFixed(2)}</span>
                            </div>
                            <hr style="margin: 10px 0;">
                            <div class="summary-row total">
                                <span>TOTAL:</span>
                                <span>R$ ${order.total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <h3>🚚 Próximos Passos</h3>
                        <p>✅ Pedido Realizado</p>
                        <p>⏳ Processando (até 24h)</p>
                        <p>🚚 Será enviado em breve</p>
                        <p>📍 Acompanhe o status no seu perfil</p>
                        <a href="https://localhost:3000/orders.html" class="button">Acompanhar Pedido</a>
                    </div>

                    <div class="section">
                        <h3>📞 Dúvidas?</h3>
                        <p>📧 Email: contato@primesneaker.com</p>
                        <p>📲 WhatsApp: (34) 99999-9999</p>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2026 Prime Sneaker - Loja de Tenis Premium</p>
                    <p>Desenvolvido com ❤️</p>
                </div>
            </div>
        </body>
        </html>
        `;
    },

    async sendOrderStatusUpdate(order, user) {
        try {
            const statusLabels = {
                [ORDER_STATUS.WAITING_PAYMENT]: { label: 'Aguardando Pagamento', emoji: 'PIX', color: '#f39c12' },
                [ORDER_STATUS.PROCESSING]: { label: 'Processando', emoji: '🔄', color: '#3498db' },
                [ORDER_STATUS.SHIPPED]: { label: 'Enviado', emoji: '🚚', color: '#2ecc71' },
                [ORDER_STATUS.DELIVERED]: { label: 'Entregue', emoji: '✅', color: '#27ae60' },
                [ORDER_STATUS.CANCELED]: { label: 'Cancelado', emoji: '❌', color: '#e74c3c' },
            };

            const normalizedStatus = normalizeOrderStatus(order.status);
            const info = statusLabels[normalizedStatus] || { label: normalizedStatus || 'Status desconhecido', emoji: '📦', color: '#333' };

            await transporter.sendMail({
                from: `"Prime Sneaker" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: `${info.emoji} Pedido #${order.id} — ${info.label}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #111; padding: 1.5rem; text-align: center;">
                            <h1 style="color: #f0c040; margin: 0;">PRIME SNEAKER</h1>
                        </div>
                        <div style="padding: 2rem; background: #fff;">
                            <h2 style="color: #333;">Olá, ${user.name}!</h2>
                            <p style="color: #555;">O status do seu pedido foi atualizado:</p>

                            <div style="background: #f8f8f8; border-left: 4px solid ${info.color}; padding: 1.5rem; border-radius: 4px; margin: 1.5rem 0; text-align: center;">
                                <div style="font-size: 3rem;">${info.emoji}</div>
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${info.color}; margin-top: 0.5rem;">${info.label}</div>
                                <div style="color: #888; margin-top: 0.25rem;">Pedido #${order.id}</div>
                            </div>

                            <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
                                <tr style="background: #f0f0f0;">
                                    <td style="padding: 0.75rem; font-weight: bold;">Pedido</td>
                                    <td style="padding: 0.75rem;">#${order.id}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 0.75rem; font-weight: bold;">Total</td>
                                    <td style="padding: 0.75rem;">R$ ${Number(order.total).toFixed(2).replace('.', ',')}</td>
                                </tr>
                                <tr style="background: #f0f0f0;">
                                    <td style="padding: 0.75rem; font-weight: bold;">Status</td>
                                    <td style="padding: 0.75rem; color: ${info.color}; font-weight: bold;">${info.label}</td>
                                </tr>
                            </table>

                            ${normalizedStatus === ORDER_STATUS.SHIPPED ? `
                            <div style="background: #e8f5e9; padding: 1rem; border-radius: 4px; margin-top: 1.5rem; text-align: center;">
                                <p style="margin: 0; color: #2e7d32;">🚚 Seu pedido está a caminho! Em breve chegará na sua casa.</p>
                            </div>` : ''}

                            ${normalizedStatus === ORDER_STATUS.DELIVERED ? `
                            <div style="background: #e8f5e9; padding: 1rem; border-radius: 4px; margin-top: 1.5rem; text-align: center;">
                                <p style="margin: 0; color: #2e7d32;">🎉 Seu pedido foi entregue! Aproveite seu tênis.</p>
                            </div>` : ''}

                            ${normalizedStatus === ORDER_STATUS.CANCELED ? `
                            <div style="background: #ffebee; padding: 1rem; border-radius: 4px; margin-top: 1.5rem; text-align: center;">
                                <p style="margin: 0; color: #c62828;">Seu pedido foi cancelado. Entre em contato se tiver dúvidas.</p>
                            </div>` : ''}
                        </div>
                        <div style="background: #111; padding: 1rem; text-align: center; color: #888; font-size: 0.85rem;">
                            Prime Sneaker — Sua jornada começa pelos pés
                        </div>
                    </div>
                `,
            });

            console.log(`✅ Email de status enviado para ${user.email}`);
            return true;
        } catch (err) {
            console.error(`❌ Erro ao enviar email de status:`, err.message);
            return false;
        }
    },

    async sendNewsletterWelcome(email) {
        try {
            const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bem-vindo a Prime Sneaker</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4; padding: 40px 0;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-width: 600px;">
                                <!-- Header -->
                                <tr>
                                    <td style="background: linear-gradient(135deg, #1a1a1a 0%, #2c2c2c 100%); padding: 40px 40px; text-align: center;">
                                        <img src="${process.env.APP_URL || 'http://localhost:3000'}/images/logo.png" alt="Prime Sneaker" style="max-width: 260px; height: auto; display: block; margin: 0 auto;" />
                                    </td>
                                </tr>

                                <!-- Hero -->
                                <tr>
                                    <td style="padding: 50px 40px 30px 40px; text-align: center;">
                                        <div style="font-size: 60px; margin-bottom: 20px;">👟</div>
                                        <h2 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 28px;">
                                            Bem-vindo a bordo!
                                        </h2>
                                        <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0;">
                                            Voce se inscreveu para receber as melhores ofertas, lançamentos exclusivos e novidades do mundo dos tenis premium direto no seu email.
                                        </p>
                                    </td>
                                </tr>

                                <!-- Benefits -->
                                <tr>
                                    <td style="padding: 0 40px 30px 40px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #faf8f3; border-left: 4px solid #d4a017; border-radius: 6px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <p style="margin: 0 0 12px 0; color: #1a1a1a; font-weight: 600; font-size: 16px;">
                                                        O que voce vai receber:
                                                    </p>
                                                    <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8;">
                                                        <li>🔥 Ofertas exclusivas para inscritos</li>
                                                        <li>👟 Lançamentos antes de todo mundo</li>
                                                        <li>💸 Cupons de desconto especiais</li>
                                                        <li>📰 Novidades e tendencias do mercado</li>
                                                    </ul>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <!-- CTA -->
                                <tr>
                                    <td style="padding: 0 40px 40px 40px; text-align: center;">
                                        <a href="${process.env.APP_URL || 'http://localhost:3000'}/search.html"
                                           style="display: inline-block; background-color: #d4a017; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; letter-spacing: 0.5px;">
                                            Explorar Catalogo
                                        </a>
                                    </td>
                                </tr>

                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #1a1a1a; padding: 30px 40px; text-align: center;">
                                        <p style="color: #aaa; font-size: 13px; margin: 0 0 8px 0;">
                                            Prime Sneaker - Loja de Tenis Premium
                                        </p>
                                        <p style="color: #777; font-size: 12px; margin: 0;">
                                            Voce esta recebendo este email porque se inscreveu na nossa newsletter.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `;

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: '🎉 Bem-vindo a Prime Sneaker!',
                html,
                text: `Bem-vindo a Prime Sneaker!\n\nVoce se inscreveu para receber as melhores ofertas e lançamentos da nossa loja. Fique de olho no seu email!`,
            });

            console.log(`✅ Email de newsletter enviado para ${email}`);
            return true;
        } catch (err) {
            console.error(`❌ Erro ao enviar email de newsletter para ${email}:`, err.message);
            return false;
        }
    },
};

module.exports = emailService;
