module.exports = {
  apps: [
    {
      name: "siwi-api",
      cwd: "/var/www/siwi/server",
      script: "../node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "siwi-web",
      cwd: "/var/www/siwi/apps/web",
      script: "../../node_modules/next/dist/bin/next",
      args: "start -p 3100",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production", PORT: 3100 },
    },
  ],
};
