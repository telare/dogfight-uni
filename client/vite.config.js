import { defineConfig } from 'vite'

export default defineConfig({
  build: { minify: false, sourcemap: true },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (
              res &&
              !res.headersSent &&
              typeof res.writeHead === 'function'
            ) {
              res.writeHead(503, {
                'Content-Type': 'application/json; charset=utf-8',
              })
              res.end(
                JSON.stringify({
                  error:
                    'Сервер Node.js не запущено на http://127.0.0.1:3000. Будь ласка, запустіть "npm run dev:server" або "npm start".',
                  code: 'BACKEND_OFFLINE',
                }),
              )
            }
          })
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // М'яке приглушення спаму помилок підключення сокета, якщо сервер ще стартує
          })
        },
      },
    },
  },
})
