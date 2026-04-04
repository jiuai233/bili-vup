module.exports = {
  apps: [
    {
      name: "vup-web-api",
      script: "./src/index.js",
      instances: 1,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
