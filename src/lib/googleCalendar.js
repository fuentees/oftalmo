const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "12:00";
const GOOGLE_CALENDAR_BASE_URL = "https://calendar.google.com/calendar/render";
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const DEFAULT_GOOGLE_CALENDAR_VISIBILITY = {
  includeTrainingDescription: true,
  includeTrainingCode: true,
  includeCoordinator: true,
  includeInstructor: true,
  includeParticipantName: true,
  includeParticipantEmail: true,
  includeParticipantRegion: true,
  includeLocation: true,
};

const normalizeDateValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeTimeValue = (value, fallback) => {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return fallback;
};

const parseDateTime = (dateValue, timeValue) => {
  const date = normalizeDateValue(dateValue);
  const time = normalizeTimeValue(timeValue, DEFAULT_START_TIME);
  if (!date) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatGoogleDateUtc = (value) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const resolveTrainingDates = (training) => {
  const list = Array.isArray(training?.dates) ? [...training.dates] : [];
  return list
    .map((item) => {
      const date = normalizeDateValue(item?.date);
      if (!date) return null;
      return {
        date,
        start_time: normalizeTimeValue(item?.start_time, DEFAULT_START_TIME),
        end_time: normalizeTimeValue(item?.end_time, DEFAULT_END_TIME),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

const resolveEventBounds = (training) => {
  const dates = resolveTrainingDates(training);
  if (dates.length > 0) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    const start = parseDateTime(first.date, first.start_time) || new Date();
    let end = parseDateTime(last.date, last.end_time);
    if (!end || end <= start) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return { start, end };
  }
  const now = new Date();
  return {
    start: now,
    end: new Date(now.getTime() + 60 * 60 * 1000),
  };
};

const resolveSingleEmail = (value) => {
  const candidates = String(value || "")
    .split(/[;,\n]+/)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (SIMPLE_EMAIL_REGEX.test(candidate)) return candidate;
  }
  return "";
};

export const isValidCalendarEmail = (value) => {
  const resolved = resolveSingleEmail(value);
  return Boolean(resolved);
};

export const buildGoogleCalendarUrl = ({
  training,
  participant,
  attendeeEmail,
  visibilityOptions = {},
}) => {
  const options = {
    ...DEFAULT_GOOGLE_CALENDAR_VISIBILITY,
    ...(visibilityOptions || {}),
  };
  const participantName = String(participant?.professional_name || "").trim();
  const participantEmail = String(participant?.professional_email || "").trim();
  const participantMunicipality = String(participant?.municipality || "").trim();
  const participantGve = String(participant?.health_region || "").trim();
  const eventTitle = String(training?.title || "Treinamento").trim();
  const location = options.includeLocation
    ? String(training?.location || "").trim()
    : "";
  const description = String(training?.description || "").trim();
  const trainingCode = String(training?.code || "").trim();
  const instructor = String(training?.instructor || "").trim();
  const coordinator = String(training?.coordinator || "").trim();
  const { start, end } = resolveEventBounds(training);
  const lines = [];
  if (options.includeTrainingDescription && description) lines.push(description);
  if (options.includeTrainingCode && trainingCode) lines.push(`Código: ${trainingCode}`);
  if (options.includeCoordinator && coordinator) lines.push(`Coordenação: ${coordinator}`);
  if (options.includeInstructor && instructor) lines.push(`Instrutor(a): ${instructor}`);
  if (options.includeParticipantName && participantName) {
    lines.push(`Participante: ${participantName}`);
  }
  if (options.includeParticipantEmail && participantEmail) {
    lines.push(`E-mail: ${participantEmail}`);
  }
  if (options.includeParticipantRegion && (participantMunicipality || participantGve)) {
    const regionLine = [participantMunicipality, participantGve]
      .filter(Boolean)
      .join(" • ");
    if (regionLine) lines.push(`Região: ${regionLine}`);
  }
  const details = lines.join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle,
    dates: `${formatGoogleDateUtc(start)}/${formatGoogleDateUtc(end)}`,
    details,
    location,
    ctz: "America/Sao_Paulo",
  });

  const attendee = resolveSingleEmail(attendeeEmail || participantEmail);
  if (attendee) {
    params.set("add", attendee);
  }

  return `${GOOGLE_CALENDAR_BASE_URL}?${params.toString()}`;
};
