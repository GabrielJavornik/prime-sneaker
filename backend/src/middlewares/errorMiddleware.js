/**
 * Middleware global para tratamento de erros.
 * Os controllers fazem next(err) ou throw e caem aqui.
 */

// 404 - rota nao encontrada
function notFoundHandler(req, res, next) {
    res.status(404).json({
        error: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
        status: 404,
    });
}

// Erro generico (500 por padrao)
function errorHandler(err, req, res, next) {
    console.error('[ERROR]', err);
    const status = err.status || 500;
    res.status(status).json({
        error: err.message || 'Erro interno do servidor',
        status,
    });
}

module.exports = { notFoundHandler, errorHandler };
