module.exports = {
  apps: [
    {
      name: 'st-app',
      script: './backend/src/index.js',
      instances: 'max',       // one worker per CPU core
      exec_mode: 'cluster',   // PM2 load-balances across workers
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
      // restart if memory grows above 500 MB (memory leak guard)
      max_memory_restart: '500M',
      // exponential back-off on crashes (1s → 2s → 4s … max 30s)
      exp_backoff_restart_delay: 100,
    },
  ],
};
