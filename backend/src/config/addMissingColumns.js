/**
 * Compatibilidade com o nome antigo.
 * O fluxo oficial de migracoes agora fica em src/config/migrations.js.
 *
 * Use: npm run migrate
 */
const { runMigrationsCli } = require('./migrations');

runMigrationsCli();
