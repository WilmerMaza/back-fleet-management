/**
 * Página HTML de bienvenida de la API KONTI (raíz `/`).
 *
 * Superficie de marca para humanos que abren la URL del back en el navegador.
 * No sustituye `/api/v1/health` (JSON para probes).
 */

export type KontiApiHomeStatus = 'ok' | 'starting' | 'error';

export interface KontiApiHomeInput {
  status: KontiApiHomeStatus;
  errorMessage?: string;
  healthPath?: string;
  apiPrefix?: string;
  year?: number;
}

const STATUS_COPY: Record<
  KontiApiHomeStatus,
  { label: string; detail: string; tone: string; glow: string }
> = {
  ok: {
    label: 'Operativa',
    detail: 'La API responde y la base de datos está conectada.',
    tone: '#16A34A',
    glow: 'rgba(22, 163, 74, 0.35)',
  },
  starting: {
    label: 'Arrancando',
    detail: 'Montando Nest y abriendo la conexión a datos…',
    tone: '#F4A340',
    glow: 'rgba(244, 163, 64, 0.35)',
  },
  error: {
    label: 'No disponible',
    detail: 'El arranque falló. Revisa el mensaje técnico abajo.',
    tone: '#DC3E42',
    glow: 'rgba(220, 62, 66, 0.35)',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Renderiza el home de la API con identidad KONTI (Verde Petrol + acento).
 */
export function renderKontiApiHomePage(input: KontiApiHomeInput): string {
  const status = input.status;
  const copy = STATUS_COPY[status];
  const healthPath = input.healthPath ?? '/api/v1/health';
  const apiPrefix = input.apiPrefix ?? '/api/v1';
  const year = input.year ?? new Date().getFullYear();
  const errorBlock =
    status === 'error' && input.errorMessage
      ? `<pre class="error">${escapeHtml(input.errorMessage)}</pre>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="theme-color" content="#0F5B5B"/>
  <title>KONTI API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --ink: #0F172A;
      --muted: #64748B;
      --line: #E2E8F0;
      --canvas: #F7F9FA;
      --brand: #0F5B5B;
      --accent: #19C3B1;
      --surface: #FFFFFF;
      --status: ${copy.tone};
      --status-glow: ${copy.glow};
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: Inter, system-ui, sans-serif;
      background:
        radial-gradient(1200px 600px at 12% -10%, rgba(25, 195, 177, 0.18), transparent 55%),
        radial-gradient(900px 500px at 100% 0%, rgba(15, 91, 91, 0.14), transparent 50%),
        linear-gradient(180deg, #F7F9FA 0%, #EEF3F4 100%);
      min-height: 100%;
    }
    .shell {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: 32px 20px;
    }
    .card {
      width: min(560px, 100%);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 36px 32px 28px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.06);
      animation: rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .brand {
      font-family: Manrope, Inter, sans-serif;
      font-weight: 800;
      font-size: clamp(2rem, 5vw, 2.5rem);
      letter-spacing: 0.06em;
      color: var(--brand);
      margin: 0;
      line-height: 1;
    }
    .tagline {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 0.95rem;
      font-weight: 500;
    }
    .divider {
      height: 1px;
      background: linear-gradient(90deg, var(--accent), transparent 80%);
      margin: 28px 0 24px;
      opacity: 0.55;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--status) 10%, white);
      border: 1px solid color-mix(in srgb, var(--status) 28%, white);
      color: var(--status);
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--status);
      box-shadow: 0 0 0 4px var(--status-glow);
      animation: pulse 1.8s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.75; }
    }
    h2 {
      margin: 18px 0 8px;
      font-family: Manrope, Inter, sans-serif;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--ink);
    }
    .detail {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.55;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 24px;
    }
    a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
      border-radius: 10px;
      padding: 11px 16px;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
    }
    a.btn:hover { transform: translateY(-1px); }
    a.btn-primary {
      background: var(--brand);
      color: #fff;
    }
    a.btn-primary:hover { background: #0c4c4c; }
    .chip {
      display: inline-flex;
      align-items: center;
      color: var(--brand);
      border: 1px solid color-mix(in srgb, var(--brand) 28%, white);
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .meta {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      justify-content: space-between;
      color: #94A3B8;
      font-size: 0.75rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      color: var(--brand);
      background: #F1F5F9;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .error {
      margin: 16px 0 0;
      padding: 12px 14px;
      border-radius: 12px;
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: #991B1B;
      font-size: 0.78rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      .card, .dot { animation: none; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="card" aria-labelledby="brand">
      <p class="brand" id="brand">KONTI</p>
      <p class="tagline">Más que mantenimiento. Es continuidad.</p>
      <div class="divider" aria-hidden="true"></div>
      <div class="status" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        ${escapeHtml(copy.label)}
      </div>
      <h2>API de gestión vehicular</h2>
      <p class="detail">${escapeHtml(copy.detail)}</p>
      ${errorBlock}
      <div class="links">
        <a class="btn btn-primary" href="${escapeHtml(healthPath)}">Ver health JSON</a>
        <span class="chip">Prefijo <code>${escapeHtml(apiPrefix)}</code></span>
      </div>
      <div class="meta">
        <span>KONTI Gestión · backend</span>
        <span>© ${year}</span>
      </div>
    </section>
  </main>
</body>
</html>`;
}
