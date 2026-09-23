// supabase/functions/resend-support/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'dualorbitlabs@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();

    const {
      name = 'No proporcionado',
      email = '',
      subject = '[DualOrganizer] Contacto',
      message = '',
      browserContext = {},
    } = payload;

    // ─── Validación del servidor ───
    if (!email || !EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Correo electrónico inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!message || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'El mensaje no puede estar vacío' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (message.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'El mensaje es demasiado largo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY no está configurada');
      return new Response(
        JSON.stringify({ error: 'Servicio de correo no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Formatear contexto del navegador ───
    const contextLines = [
      '── Contexto del navegador ──',
      `Página:       ${browserContext.url || 'N/A'}`,
      `Título:       ${browserContext.title || 'N/A'}`,
      `Referrer:     ${browserContext.referrer || 'N/A'}`,
      `User Agent:   ${browserContext.userAgent || 'N/A'}`,
      `Plataforma:   ${browserContext.platform || 'N/A'}`,
      `Idioma:       ${browserContext.language || 'N/A'} (${browserContext.languages || 'N/A'})`,
      `Zona Horaria: ${browserContext.timezone || 'N/A'} (UTC${browserContext.timezoneOffset ?? '?'})`,
      `Resolución:   ${browserContext.screenResolution || 'N/A'}`,
      `Viewport:     ${browserContext.viewport || 'N/A'}`,
      `Pixel Ratio:  ${browserContext.devicePixelRatio || 'N/A'}`,
      `Color Depth:  ${browserContext.colorDepth || 'N/A'}`,
      `Touch:        ${browserContext.touchSupport ? 'Sí' : 'No'}`,
      `Online:       ${browserContext.online ? 'Sí' : 'No'}`,
      `Cookies:      ${browserContext.cookiesEnabled ? 'Habilitadas' : 'Deshabilitadas'}`,
      `Timestamp:    ${browserContext.clientTimestamp || 'N/A'}`,
    ].join('\n');

    // ─── Construir HTML del correo ───
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; color: #0f172a;">
        <h2 style="color: #0f172a; margin-bottom: 4px;">Nuevo mensaje de contacto</h2>
        <p style="color: #64748b; margin-top: 0;">DualOrganizer — Formulario de soporte</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0;" />
        <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
        <p><strong>Correo:</strong> <a href="mailto:${escapeHtml(email)}" style="color: #0f172a;">${escapeHtml(email)}</a></p>
        <p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0;" />
        <p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message)}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0;" />
        <pre style="background: #f8fafc; padding: 14px; border-radius: 8px; font-size: 12px; line-height: 1.6; color: #334155; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(contextLines)}</pre>
      </div>
    `;

    // ─── Enviar vía Resend ───
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // ⚠️ Cambia esto por tu dominio verificado antes de ir a producción
        from: 'DualOrganizer Support <onboarding@resend.dev>',
        to: [SUPPORT_EMAIL],
        reply_to: email,
        subject,
        html: htmlBody,
      }),
    });

    const resendData = await res.json();

    if (!res.ok) {
      console.error('Error de Resend:', resendData);
      return new Response(
        JSON.stringify({ error: resendData.message || 'Error al enviar el correo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error inesperado:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});