/**
 * Compatibilidade com o script antigo.
 * O fluxo oficial agora e: npm run migrate.
 */
const { runMigrationsCli } = require('./src/config/migrations');

runMigrationsCli();
