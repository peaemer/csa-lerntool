// pm2-Konfiguration: npm i -g pm2, dann pm2 start deploy/ecosystem.config.cjs
// Ein Prozess genügt – die Lernstände liegen als Dateien, die Zugriffsbegrenzung im
// Arbeitsspeicher gilt pro Prozess.
module.exports = {
  apps: [
    {
      name: 'csa-lerntool',
      script: 'server/index.mjs',
      // Anpassen: Verzeichnis, in dem das Projekt auf dem Server liegt.
      cwd: '/opt/csa-lerntool',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        HOST: '127.0.0.1',
        TRUST_PROXY: 1,
        STATE_DIR: './server-state',
        PRUNE_DAYS: 0,
      },
      time_lines: true,
      out_file: './logs/csa-lerntool.out.log',
      error_file: './logs/csa-lerntool.error.log',
      merge_logs: true,
    },
  ],
};
