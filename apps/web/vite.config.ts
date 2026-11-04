import preact from '@preact/preset-vite';
import { defineConfig, type PluginOption } from 'vite';

// HTTPS in LAN (serve ai sensori del telefono): `HTTPS=1 pnpm dev`.
// vite-plugin-mkcert installa un certificato locale nel sistema: lo attiva solo chi lo chiede.
export default defineConfig(async () => {
  const plugins: PluginOption[] = [preact()];
  if (process.env.HTTPS === '1') {
    const { default: mkcert } = await import('vite-plugin-mkcert');
    plugins.push(mkcert());
  }
  return {
    plugins,
    build: { target: 'es2022', sourcemap: false, cssCodeSplit: true },
    server: { host: true },
  };
});
