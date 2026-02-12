import { serve } from "https://deno.land/std/http/server.ts";

export const config = { verify_jwt: false };

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { to, subject, html, from, attachments } = await req.json();

    const fromValue =
      from?.email
        ? `${from?.name ? `${from.name} ` : ""}<${from.email}>`
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

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return new Response(await response.text(), {
        status: 500,
        headers: corsHeaders,
      });
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
