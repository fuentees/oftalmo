import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = { verify_jwt: false };

// Esta função é chamada por páginas públicas sem login (confirmação de inscrição,
// presença, etc.), então não pode exigir um JWT de usuário. Em vez disso, aplicamos
// limites de payload e rate limiting por destinatário/IP para reduzir o risco de
// abuso (spam/phishing usando o domínio e o crédito de e-mail do projeto).
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 500_000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BASE64_LENGTH = 8_000_000; // ~6MB decodificado
const MAX_RECIPIENTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_PER_RECIPIENT = 20;
const RATE_LIMIT_MAX_PER_IP = 40;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const getServiceClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeRecipients = (to: unknown): string[] => {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
};

const validatePayload = (payload: Record<string, unknown>): string | null => {
  const recipients = normalizeRecipients(payload.to);
  if (recipients.length === 0) return "Destinatário (to) é obrigatório.";
  if (recipients.length > MAX_RECIPIENTS) {
    return `No máximo ${MAX_RECIPIENTS} destinatário(s) por envio.`;
  }
  if (recipients.some((email) => !EMAIL_PATTERN.test(email))) {
    return "Destinatário inválido.";
  }

  const subject = String(payload.subject ?? "").trim();
  if (!subject) return "Assunto (subject) é obrigatório.";
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Assunto excede o limite de ${MAX_SUBJECT_LENGTH} caracteres.`;
  }

  const html = String(payload.html ?? "");
  if (!html.trim()) return "Corpo do e-mail (html) é obrigatório.";
  if (html.length > MAX_HTML_LENGTH) {
    return "Corpo do e-mail excede o tamanho máximo permitido.";
  }

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (attachments.length > MAX_ATTACHMENTS) {
    return `No máximo ${MAX_ATTACHMENTS} anexo(s) por e-mail.`;
  }
  for (const attachment of attachments) {
    const content = String((attachment as { content?: unknown })?.content ?? "");
    if (content.length > MAX_ATTACHMENT_BASE64_LENGTH) {
      return "Anexo excede o tamanho máximo permitido.";
    }
  }

  return null;
};

const getClientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("cf-connecting-ip") ||
  "unknown";

/**
 * Rate limit best-effort: se a tabela de log não existir ou a checagem falhar,
 * deixamos o envio prosseguir (evita que um problema de infraestrutura no rate
 * limiter derrube um fluxo crítico como confirmação de inscrição).
 */
const checkRateLimit = async (
  recipients: string[],
  ip: string
): Promise<string | null> => {
  const client = getServiceClient();
  if (!client) return null;

  try {
    const since = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { count: ipCount } = await client
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("client_ip", ip)
      .gte("created_at", since);
    if ((ipCount ?? 0) >= RATE_LIMIT_MAX_PER_IP) {
      return "Limite de envios por IP atingido. Tente novamente mais tarde.";
    }

    for (const recipient of recipients) {
      const { count: recipientCount } = await client
        .from("email_send_log")
        .select("id", { count: "exact", head: true })
        .eq("recipient", recipient)
        .gte("created_at", since);
      if ((recipientCount ?? 0) >= RATE_LIMIT_MAX_PER_RECIPIENT) {
        return "Limite de envios para este destinatário atingido. Tente novamente mais tarde.";
      }
    }
  } catch {
    return null;
  }

  return null;
};

const recordSendAttempt = async (recipients: string[], ip: string) => {
  const client = getServiceClient();
  if (!client) return;
  try {
    await client
      .from("email_send_log")
      .insert(recipients.map((recipient) => ({ recipient, client_ip: ip })));
  } catch {
    // Log é best-effort — não deve impedir o envio do e-mail.
  }
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const RESEND_VERIFIED_FALLBACK_DOMAIN = String(
  Deno.env.get("RESEND_VERIFIED_FALLBACK_DOMAIN") ||
    "treinamentos.vilagi.app"
)
  .trim()
  .toLowerCase();
const RESEND_LEGACY_UNVERIFIED_DOMAIN = String(
  Deno.env.get("RESEND_LEGACY_UNVERIFIED_DOMAIN") ||
    "certificados.vilagi.app"
)
  .trim()
  .toLowerCase();
const RESEND_PREFERRED_FROM_LOCAL_PART = String(
  Deno.env.get("RESEND_PREFERRED_FROM_LOCAL_PART") || "treinamentos"
)
  .trim()
  .toLowerCase();
const RESEND_PREFERRED_FROM_NAME =
  String(Deno.env.get("RESEND_PREFERRED_FROM_NAME") || "Treinamentos").trim() ||
  "Treinamentos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const extractResendErrorMessage = (rawText: string) => {
  const text = String(rawText || "").trim();
  if (!text) return "Falha ao enviar e-mail via Resend.";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed?.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Keep original plain-text response when body is not JSON.
  }
  return text;
};

const isDomainNotVerifiedMessage = (message: string) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("domain") && normalized.includes("not verified");
};

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

const buildFromValue = (email: string, name?: string) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  if (!normalizedEmail) return "";
  return normalizedName ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;
};

const parseEmailParts = (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  const [localPart, ...domainParts] = normalized.split("@");
  const domain = domainParts.join("@");
  if (!localPart || !domain) return null;
  return { localPart, domain };
};

const normalizeRequestedFromEmail = (email: string) => {
  const parsed = parseEmailParts(email);
  if (!parsed) return "";
  if (
    parsed.domain === RESEND_LEGACY_UNVERIFIED_DOMAIN &&
    RESEND_VERIFIED_FALLBACK_DOMAIN
  ) {
    return `${parsed.localPart || RESEND_PREFERRED_FROM_LOCAL_PART}@${
      RESEND_VERIFIED_FALLBACK_DOMAIN
    }`;
  }
  return `${parsed.localPart}@${parsed.domain}`;
};

const pushUnique = (list: string[], value: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return;
  if (!list.includes(normalized)) {
    list.push(normalized);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const validationError = validatePayload(requestBody);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, html, from, attachments } = requestBody;
    const recipients = normalizeRecipients(to);
    const clientIp = getClientIp(req);

    const rateLimitError = await checkRateLimit(recipients, clientIp);
    if (rateLimitError) {
      return new Response(JSON.stringify({ error: rateLimitError }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestedFromEmail = normalizeRequestedFromEmail(
      normalizeEmail(from?.email)
    );
    const requestedFromName =
      String(from?.name || "").trim() || RESEND_PREFERRED_FROM_NAME;

    const fromValue =
      requestedFromEmail
        ? buildFromValue(requestedFromEmail, requestedFromName)
        : RESEND_FROM;

    const payload = {
      from: fromValue,
      to,
      subject,
      html,
      attachments: Array.isArray(attachments)
        ? attachments.map((att) => ({
            filename: att.filename,
            content: att.content,
            type: att.contentType || "application/pdf",
          }))
        : [],
    };

    let response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let responseBody = await response.text();
      let errorMessage = extractResendErrorMessage(responseBody);
      const attemptedSenders = [payload.from];
      const retryCandidates = [];

      if (
        requestedFromEmail &&
        isDomainNotVerifiedMessage(errorMessage)
      ) {
        pushUnique(retryCandidates, RESEND_FROM);

        const requestedParts = parseEmailParts(requestedFromEmail);
        if (
          requestedParts &&
          RESEND_VERIFIED_FALLBACK_DOMAIN &&
          requestedParts.domain !== RESEND_VERIFIED_FALLBACK_DOMAIN
        ) {
          const fallbackFrom = buildFromValue(
            `${requestedParts.localPart}@${RESEND_VERIFIED_FALLBACK_DOMAIN}`,
            requestedFromName
          );
          pushUnique(retryCandidates, fallbackFrom);
        }

        const preferredFrom = buildFromValue(
          `${RESEND_PREFERRED_FROM_LOCAL_PART}@${RESEND_VERIFIED_FALLBACK_DOMAIN}`,
          RESEND_PREFERRED_FROM_NAME
        );
        pushUnique(retryCandidates, preferredFrom);
      }

      for (const retryFrom of retryCandidates) {
        if (retryFrom === payload.from) continue;
        attemptedSenders.push(retryFrom);
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...payload,
            from: retryFrom,
          }),
        });
        if (response.ok) {
          return new Response(await response.text(), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        responseBody = await response.text();
        errorMessage = extractResendErrorMessage(responseBody);
      }

      const hint = isDomainNotVerifiedMessage(errorMessage)
        ? "Domínio do remetente não verificado no Resend. Verifique em https://resend.com/domains ou ajuste o e-mail de envio para o domínio verificado (ex.: treinamentos.vilagi.app)."
        : "";

      return new Response(
        JSON.stringify({
          error: errorMessage,
          ...(hint ? { hint } : {}),
          attempted_from: attemptedSenders,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(await response.text(), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
