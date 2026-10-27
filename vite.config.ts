import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // `npm run dev:rede`: HTTPS com certificado local, para abrir pelo IP da rede.
    // Sem HTTPS o navegador bloqueia microfone, áudio do PC e webcam fora do localhost.
    const https = mode === 'rede';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), ...(https ? [basicSsl()] : [])],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
