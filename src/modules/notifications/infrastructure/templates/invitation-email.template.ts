/**
 * Plantillas HTML/texto para invitación a negocio (marca KONTI).
 */

export interface InvitationEmailTemplateInput {
  businessName: string;
  roleCode: string;
  inviteUrl: string;
  expiresAt: Date;
  inviterName?: string;
}

export interface RenderedInvitationEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderInvitationEmail(input: InvitationEmailTemplateInput): RenderedInvitationEmail {
  const expiresLabel = formatExpiresAt(input.expiresAt);
  const inviterLine = input.inviterName
    ? `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.5;">
        <strong>${escapeHtml(input.inviterName)}</strong> te invita a unirte a su equipo en KONTI.
       </p>`
    : `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.5;">
        Te invitaron a unirte a un equipo en KONTI.
       </p>`;

  const subject = `Invitación a ${input.businessName} — KONTI`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FA;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FA;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#0F5B5B;letter-spacing:0.04em;">KONTI</p>
              <p style="margin:8px 0 0;font-size:13px;color:#64748B;">Más que mantenimiento. Es continuidad.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="margin:0 0 12px;font-size:20px;color:#0F172A;">Invitación a ${escapeHtml(input.businessName)}</h1>
              ${inviterLine}
              <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.5;">
                Rol asignado: <strong style="color:#0F5B5B;">${escapeHtml(input.roleCode)}</strong>
              </p>
              <p style="margin:0 0 24px;color:#64748B;font-size:14px;line-height:1.5;">
                Esta invitación vence el <strong>${escapeHtml(expiresLabel)}</strong>.
              </p>
              <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#0F5B5B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">
                Aceptar invitación
              </a>
              <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;line-height:1.5;">
                Si el botón no funciona, copia este enlace en tu navegador:<br/>
                <span style="word-break:break-all;color:#64748B;">${escapeHtml(input.inviteUrl)}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">Este correo es transaccional. No compartas el enlace con terceros.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'KONTI — Invitación a un negocio',
    '',
    input.inviterName ? `${input.inviterName} te invita a ${input.businessName}.` : `Te invitaron a ${input.businessName}.`,
    `Rol: ${input.roleCode}`,
    `Válida hasta: ${expiresLabel}`,
    '',
    `Aceptar: ${input.inviteUrl}`,
    '',
    '— KONTI',
  ].join('\n');

  return { subject, html, text };
}

function formatExpiresAt(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
