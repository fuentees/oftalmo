import { serve } from "https://deno.land/std/http/server.ts";

export const config = { verify_jwt: false };

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const RESEND_VERIFIED_FALLBACK_DOMAIN = String(
  Deno.env.get("RESEND_VERIFIED_FALLBACK_DOMAIN") ||
    "treinamentos.vilagi.app"
)
  .trim()
  .toLowerCase();

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { to, subject, html, from, attachments } = await req.json();
    const requestedFromEmail = normalizeEmail(from?.email);
    const requestedFromName = String(from?.name || "").trim();

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
        if (RESEND_FROM && RESEND_FROM !== payload.from) {
          retryCandidates.push(RESEND_FROM);
        }
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
          if (
            fallbackFrom &&
            fallbackFrom !== payload.from &&
            !retryCandidates.includes(fallbackFrom)
          ) {
            retryCandidates.push(fallbackFrom);
          }
        }
      }

      for (const retryFrom of retryCandidates) {
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
