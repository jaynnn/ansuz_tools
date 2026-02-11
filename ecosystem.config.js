module.exports = {
  apps: [{
    name: 'ansuz_tools',
    script: 'dist/index.js',
    cwd: './backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
    },
    // Graceful shutdown settings
    kill_timeout: 5000,
    listen_timeout: 8000,
    // Log settings
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
