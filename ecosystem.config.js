module.exports = {
  apps: [
    {
      name: 'OpenThrone',
      script: 'bun',
      args: 'run dev',
      interpreter: '/home/tim/.bun/bin/bun', // Use Node.js to execute the start script
      watch: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
