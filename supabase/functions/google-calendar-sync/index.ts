import { serve } from "https://deno.land/std/http/server.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "12:00";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const GOOGLE_CALENDAR_SYNC_ENABLED = String(
  Deno.env.get("GOOGLE_CALENDAR_SYNC_ENABLED") || ""
)
  .trim()
  .toLowerCase();
const GOOGLE_SERVICE_ACCOUNT_EMAIL = String(
  Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || ""
).trim();
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = String(
  Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || ""
)
  .replace(/\\n/g, "\n")
  .trim();
const GOOGLE_CALENDAR_ID = String(Deno.env.get("GOOGLE_CALENDAR_ID") || "primary").trim();
const GOOGLE_CALENDAR_IMPERSONATED_USER = String(
  Deno.env.get("GOOGLE_CALENDAR_IMPERSONATED_USER") || ""
).trim();
const GOOGLE_CALENDAR_TIMEZONE = String(
  Deno.env.get("GOOGLE_CALENDAR_TIMEZONE") || DEFAULT_TIMEZONE
).trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeString = (value: unknown) => String(value || "").trim();

const normalizeDate = (value: unknown) => {
  const raw = normalizeString(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeTime = (value: unknown, fallback = DEFAULT_START_TIME) => {
  const raw = normalizeString(value);
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return fallback;
};

const parseDateTime = (date: string, time: string) => {
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDates = (training: any) => {
  const list = Array.isArray(training?.dates) ? [...training.dates] : [];
  return list
    .map((item) => {
      const date = normalizeDate(item?.date);
      if (!date) return null;
      return {
        date,
        start_time: normalizeTime(item?.start_time, DEFAULT_START_TIME),
        end_time: normalizeTime(item?.end_time, DEFAULT_END_TIME),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

const resolveEventBounds = (training: any) => {
  const dates = normalizeDates(training);
  if (dates.length > 0) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    const start = parseDateTime(first.date, first.start_time) || new Date();
    const endCandidate = parseDateTime(last.date, last.end_time);
    const end =
      endCandidate && endCandidate > start
        ? endCandidate
        : new Date(start.getTime() + 60 * 60 * 1000);
    return { start, end };
  }
  const now = new Date();
  return {
    start: now,
    end: new Date(now.getTime() + 60 * 60 * 1000),
  };
};

const parseEmail = (value: unknown) => {
  const tokens = normalizeString(value)
    .split(/[;,\n]+/)
    .map((item) => normalizeString(item).toLowerCase())
    .filter(Boolean);
  for (const token of tokens) {
    if (EMAIL_REGEX.test(token)) return token;
  }
  return "";
};

const getDefaultVisibility = () => ({
  includeTrainingDescription: true,
  includeTrainingCode: true,
  includeCoordinator: true,
  includeInstructor: true,
  includeParticipantName: true,
  includeParticipantEmail: true,
  includeParticipantRegion: true,
  includeLocation: true,
});

const resolveVisibility = (value: unknown) => {
  const defaults = getDefaultVisibility();
  if (!value || typeof value !== "object") return defaults;
  return {
    ...defaults,
    ...value,
  };
};

const buildEventDescription = (training: any, participant: any, visibility: any) => {
  const lines: string[] = [];
  const trainingDescription = normalizeString(training?.description);
  const trainingCode = normalizeString(training?.code);
  const coordinator = normalizeString(training?.coordinator);
  const instructor = normalizeString(training?.instructor);
  const participantName = normalizeString(participant?.professional_name);
  const participantEmail = normalizeString(participant?.professional_email);
  const municipality = normalizeString(participant?.municipality);
  const gve = normalizeString(participant?.health_region);

  if (visibility.includeTrainingDescription && trainingDescription) {
    lines.push(trainingDescription);
  }
  if (visibility.includeTrainingCode && trainingCode) {
    lines.push(`Código: ${trainingCode}`);
  }
  if (visibility.includeCoordinator && coordinator) {
    lines.push(`Coordenação: ${coordinator}`);
  }
  if (visibility.includeInstructor && instructor) {
    lines.push(`Instrutor(a): ${instructor}`);
  }
  if (visibility.includeParticipantName && participantName) {
    lines.push(`Participante: ${participantName}`);
  }
  if (visibility.includeParticipantEmail && participantEmail) {
    lines.push(`E-mail: ${participantEmail}`);
  }
  if (visibility.includeParticipantRegion && (municipality || gve)) {
    lines.push(`Região: ${[municipality, gve].filter(Boolean).join(" • ")}`);
  }
  return lines.join("\n");
};

const textEncoder = new TextEncoder();

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const toBase64Url = (value: Uint8Array | string) => {
  const binary =
    typeof value === "string"
      ? value
      : String.fromCharCode(...value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const toBase64UrlJson = (value: Record<string, unknown>) =>
  toBase64Url(textEncoder.encode(JSON.stringify(value)));

const importPrivateKey = async (pem: string) =>
  crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

const getGoogleAccessToken = async () => {
  const privateKey = await importPrivateKey(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const iat = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  if (GOOGLE_CALENDAR_IMPERSONATED_USER) {
    payload.sub = GOOGLE_CALENDAR_IMPERSONATED_USER;
  }

  const headerPart = toBase64UrlJson({ alg: "RS256", typ: "JWT" });
  const payloadPart = toBase64UrlJson(payload);
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    textEncoder.encode(unsignedToken)
  );
  const jwt = `${unsignedToken}.${toBase64Url(new Uint8Array(signature))}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao autenticar no Google: ${errorText || response.status}`);
  }

  const data = await response.json();
  const token = normalizeString(data?.access_token);
  if (!token) {
    throw new Error("Token do Google não retornado.");
  }
  return token;
};

const buildEventId = async (training: any, participant: any, attendeeEmail: string) => {
  const trainingId = normalizeString(training?.id) || normalizeString(training?.code);
  const participantId =
    normalizeString(participant?.id) ||
    normalizeString(participant?.professional_cpf) ||
    parseEmail(participant?.professional_email) ||
    attendeeEmail;
  const raw = `${trainingId}|${participantId}`.toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(raw));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `oft${hex.slice(0, 56)}`;
};

const googleRequest = async (
  accessToken: string,
  path: string,
  options: RequestInit = {}
) => {
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  return response;
};

const upsertCalendarEvent = async (payload: any) => {
  const training = payload?.training || {};
  const participant = payload?.participant || {};
  const attendeeEmail = parseEmail(payload?.attendee_email || participant?.professional_email);
  const visibility = resolveVisibility(payload?.visibility_options);
  const summary = normalizeString(training?.title) || "Treinamento";
  const location = visibility.includeLocation ? normalizeString(training?.location) : "";
  const description = buildEventDescription(training, participant, visibility);
  const { start, end } = resolveEventBounds(training);
  const eventId = await buildEventId(training, participant, attendeeEmail);
  const eventBody: Record<string, unknown> = {
    id: eventId,
    summary,
    description,
    location,
    start: {
      dateTime: start.toISOString(),
      timeZone: GOOGLE_CALENDAR_TIMEZONE || DEFAULT_TIMEZONE,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: GOOGLE_CALENDAR_TIMEZONE || DEFAULT_TIMEZONE,
    },
    extendedProperties: {
      private: {
        source: "oftalmo",
        training_id: normalizeString(training?.id),
        participant_id: normalizeString(participant?.id),
      },
    },
  };
  if (attendeeEmail) {
    eventBody.attendees = [{ email: attendeeEmail }];
  }

  const accessToken = await getGoogleAccessToken();
  const encodedCalendarId = encodeURIComponent(GOOGLE_CALENDAR_ID || "primary");
  let response = await googleRequest(
    accessToken,
    `/calendars/${encodedCalendarId}/events/${eventId}?sendUpdates=all`,
    {
      method: "PUT",
      body: JSON.stringify(eventBody),
    }
  );

  if (response.status === 404) {
    response = await googleRequest(
      accessToken,
      `/calendars/${encodedCalendarId}/events?sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify(eventBody),
      }
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Falha ao sincronizar evento (${response.status}).`);
  }

  const data = await response.json().catch(() => ({}));
  return {
    success: true,
    event_id: data?.id || eventId,
    html_link: data?.htmlLink || "",
    attendee_email: attendeeEmail,
  };
};

const deleteCalendarEvent = async (payload: any) => {
  const training = payload?.training || {};
  const participant = payload?.participant || {};
  const attendeeEmail = parseEmail(payload?.attendee_email || participant?.professional_email);
  const eventId = await buildEventId(training, participant, attendeeEmail);
  const accessToken = await getGoogleAccessToken();
  const encodedCalendarId = encodeURIComponent(GOOGLE_CALENDAR_ID || "primary");
  const response = await googleRequest(
    accessToken,
    `/calendars/${encodedCalendarId}/events/${eventId}?sendUpdates=all`,
    {
      method: "DELETE",
    }
  );

  if (response.status !== 204 && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(errorText || `Falha ao remover evento (${response.status}).`);
  }

  return {
    success: true,
    deleted: response.status === 204,
    event_id: eventId,
  };
};

const isCalendarSyncEnabled = () => {
  if (["1", "true", "yes", "on"].includes(GOOGLE_CALENDAR_SYNC_ENABLED)) return true;
  return false;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (!isCalendarSyncEnabled()) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          message: "Sincronização com Google Agenda desativada.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          message: "Credenciais do Google Agenda não configuradas.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const operation = normalizeString(payload?.operation || "upsert").toLowerCase();
    const data =
      operation === "delete"
        ? await deleteCalendarEvent(payload)
        : await upsertCalendarEvent(payload);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
