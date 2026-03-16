export const EVENT_NOTE_ONLINE_LINK_PREFIX = "link_online:";
export const EVENT_NOTE_TRAINING_ID_PREFIX = "training_id:";

const METADATA_PREFIXES = [
  EVENT_NOTE_ONLINE_LINK_PREFIX,
  EVENT_NOTE_TRAINING_ID_PREFIX,
];

const startsWithPrefix = (line, prefix) =>
  String(line || "")
    .trim()
    .toLowerCase()
    .startsWith(prefix);

export const extractMetadataValue = (value, prefix) => {
  const lines = String(value || "").split("\n");
  const match = lines.find((line) => startsWithPrefix(line, prefix));
  if (!match) return "";
  return match.slice(prefix.length).trim();
};

export const extractOnlineLinkFromEventNotes = (value) =>
  extractMetadataValue(value, EVENT_NOTE_ONLINE_LINK_PREFIX);

export const extractTrainingIdFromEventNotes = (value) =>
  extractMetadataValue(value, EVENT_NOTE_TRAINING_ID_PREFIX);

export const stripEventMetadata = (value) =>
  String(value || "")
    .split("\n")
    .filter((line) => {
      const trimmed = String(line || "").trim().toLowerCase();
      return !METADATA_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    })
    .join("\n")
    .trim();

export const buildEventNotes = ({ notes, onlineLink, trainingId }) => {
  const cleanNotes = stripEventMetadata(notes);
  const cleanLink = String(onlineLink || "").trim();
  const cleanTrainingId = String(trainingId || "").trim();

  const lines = [cleanNotes];
  if (cleanLink) {
    lines.push(`${EVENT_NOTE_ONLINE_LINK_PREFIX} ${cleanLink}`);
  }
  if (cleanTrainingId) {
    lines.push(`${EVENT_NOTE_TRAINING_ID_PREFIX} ${cleanTrainingId}`);
  }

  return lines.filter(Boolean).join("\n").trim();
};
