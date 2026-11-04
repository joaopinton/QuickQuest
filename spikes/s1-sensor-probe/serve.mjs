// Server statico minimo per la sonda (HTTP). I sensori richiedono HTTPS: mettilo dietro
// un tunnel (vedi README) oppure carica la cartella su un hosting statico.
// Serve solo i file della pagina: niente node_modules, test o tracce.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const ALLOWED = /^\/(index\.html|style\.css|src\/[a-z]+\.js)$/;

/**
 * Traduce l'URL richiesto in un file servibile, oppure null.
 * @param {string} url
 * @returns {string|null} percorso relativo alla cartella dello spike
 */
export function resolveRequest(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';
  return ALLOWED.test(pathname) ? pathname.slice(1) : null;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function start(port) {
  const server = createServer(async (req, res) => {
    const rel = req.method === 'GET' ? resolveRequest(req.url ?? '/') : null;
    if (!rel) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
      return;
    }
    try {
      const body = await readFile(path.join(ROOT, rel));
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(rel)] }).end(body);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
    }
  });
  server.listen(port, '0.0.0.0', () => {
    const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    process.stdout.write(`Sonda S1 su http://localhost:${port}\n`);
    for (const n of ips) process.stdout.write(`  in LAN: http://${n.address}:${port} (senza HTTPS i sensori non partono)\n`);
    process.stdout.write(`Per l'HTTPS: cloudflared tunnel --url http://localhost:${port}\n`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start(Number(process.argv[2]) || 5173);
}
