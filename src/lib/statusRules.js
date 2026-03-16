import { parseDateSafe } from "@/lib/date";

export const parseTimeToParts = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
};

export const parseDateTimeWithOptionalTime = (dateValue, timeValue, isEnd) => {
  const date = parseDateSafe(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const parsedTime = parseTimeToParts(timeValue);
  if (parsedTime) {
    date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    return date;
  }

  if (isEnd) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const normalizeStatus = (value) => String(value ?? "").trim().toLowerCase();

export const getTrainingDateItems = (training) => {
  if (!training) return [];
  if (Array.isArray(training.dates) && training.dates.length > 0) {
    return training.dates
      .map((item) => {
        if (typeof item === "object") {
          return {
            date: item?.date,
            start_time: item?.start_time,
            end_time: item?.end_time,
          };
        }
        return { date: item, start_time: "", end_time: "" };
      })
      .filter((item) => item?.date);
  }
  if (training.date) {
    return [
      {
        date: training.date,
        start_time: training.start_time || "",
        end_time: training.end_time || "",
      },
    ];
  }
  return [];
};

export const getTrainingDateBounds = (training) => {
  const items = getTrainingDateItems(training);
  if (!items.length) return null;

  const starts = [];
  const ends = [];
  items.forEach((item) => {
    const startDateTime = parseDateTimeWithOptionalTime(
      item.date,
      item.start_time,
      false
    );
    const endDateTime = parseDateTimeWithOptionalTime(
      item.date,
      item.end_time,
      true
    );
    if (startDateTime) starts.push(startDateTime.getTime());
    if (endDateTime) ends.push(endDateTime.getTime());
  });

  if (!starts.length || !ends.length) return null;
  return {
    start: new Date(Math.min(...starts)),
    end: new Date(Math.max(...ends)),
  };
};

export const getEffectiveTrainingStatus = (training, now = new Date()) => {
  if (!training) return "agendado";
  const normalizedStatus = normalizeStatus(training.status);
  if (normalizedStatus === "cancelado") return "cancelado";

  const bounds = getTrainingDateBounds(training);
  if (!bounds) return normalizedStatus || "agendado";

  if (now < bounds.start) {
    return normalizedStatus === "confirmado" ? "confirmado" : "agendado";
  }
  if (now > bounds.end) return "concluido";
  return "em_andamento";
};

export const getEventDateBounds = (event) => {
  if (!event) return null;
  const start = parseDateTimeWithOptionalTime(
    event.start_date,
    event.start_time,
    false
  );
  const end = parseDateTimeWithOptionalTime(
    event.end_date || event.start_date,
    event.end_time,
    true
  );
  if (!start || !end) return null;
  return { start, end };
};

export const getEffectiveEventStatus = (event, now = new Date()) => {
  if (!event) return "planejado";

  const normalizedStatus = normalizeStatus(event.status);
  if (normalizedStatus === "cancelado") return "cancelado";

  const bounds = getEventDateBounds(event);
  if (!bounds) {
    if (normalizedStatus === "agendado") return "planejado";
    return normalizedStatus || "planejado";
  }

  if (now < bounds.start) {
    return normalizedStatus === "confirmado" ? "confirmado" : "planejado";
  }
  if (now <= bounds.end) return "em_andamento";
  return "concluido";
};
