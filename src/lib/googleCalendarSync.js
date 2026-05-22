const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function apiFetch(url, method, accessToken, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function createCalendarEvent(accessToken, event) {
  return apiFetch(API, "POST", accessToken, event);
}

export async function updateCalendarEvent(accessToken, eventId, event) {
  return apiFetch(`${API}/${eventId}`, "PUT", accessToken, event);
}

export async function deleteCalendarEvent(accessToken, eventId) {
  const res = await fetch(`${API}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`HTTP ${res.status}`);
  }
}

function toDateTime(date, time, tz = "America/Sao_Paulo") {
  if (!date) return null;
  const t = /^\d{2}:\d{2}$/.test(time || "") ? time : "08:00";
  return { dateTime: `${date}T${t}:00`, timeZone: tz };
}

function toDate(date, tz = "America/Sao_Paulo") {
  if (!date) return null;
  return { date, timeZone: tz };
}

export function buildTrainingGCalEvent(training) {
  const dates = Array.isArray(training.dates)
    ? training.dates.filter((d) => d?.date).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  let start, end;
  if (dates.length > 0) {
    start = toDateTime(dates[0].date, dates[0].start_time);
    const last = dates[dates.length - 1];
    end = toDateTime(last.date, last.end_time || "17:00");
  } else {
    const d = training.date;
    start = toDateTime(d, training.start_time);
    end = toDateTime(d, training.end_time || "17:00");
  }

  if (!start) return null;
  if (!end || end.dateTime <= start.dateTime) {
    const endMs = new Date(start.dateTime).getTime() + 4 * 3600_000;
    end = { dateTime: new Date(endMs).toISOString(), timeZone: "America/Sao_Paulo" };
  }

  const desc = [
    training.description,
    training.code && `Código: ${training.code}`,
    training.instructor && `Instrutor(a): ${training.instructor}`,
    training.coordinator && `Coordenação: ${training.coordinator}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: training.title || "Treinamento",
    location: training.location || "",
    description: desc,
    start,
    end,
  };
}

function nextDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function buildEventGCalEvent(event) {
  const startDate = event.start_date;
  if (!startDate) return null;
  // Google Calendar API: end date for all-day events is exclusive (must be next day)
  const endDate = nextDay(event.end_date || startDate);

  const desc = [event.description, event.online_link && `Link: ${event.online_link}`]
    .filter(Boolean)
    .join("\n");

  return {
    summary: event.title || "Evento",
    location: event.location || "",
    description: desc,
    start: toDate(startDate),
    end: toDate(endDate),
  };
}
