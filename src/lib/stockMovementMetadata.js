export const STOCK_MOVEMENT_META_PREFIX = "[STOCK_META]";

const normalizeText = (value) => String(value || "").trim();

const normalizeDestinationMode = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "gve") return "gve";
  if (normalized === "setor") return "setor";
  if (normalized === "outros") return "outros";
  return "municipio";
};

const normalizePurpose = (metadata) => ({
  event: Boolean(metadata?.purpose_event || metadata?.event),
  training: Boolean(metadata?.purpose_training || metadata?.training),
  distribution: Boolean(
    metadata?.purpose_distribution || metadata?.distribution
  ),
});

const buildSanitizedMetadata = (metadata) => {
  const purpose = normalizePurpose(metadata);
  const destinationMode = normalizeDestinationMode(metadata?.destination_mode);
  const destinationMunicipio = normalizeText(
    metadata?.destination_municipio || metadata?.municipality
  );
  const destinationGve = normalizeText(
    metadata?.destination_gve || metadata?.gve
  );
  const destinationSector = normalizeText(
    metadata?.destination_sector || metadata?.sector_label
  );
  const destinationOther = normalizeText(
    metadata?.destination_other || metadata?.other_destination
  );
  const responsibleAuto = Boolean(
    metadata?.responsible_auto || metadata?.auto_responsible
  );
  const responsibleUser = normalizeText(
    metadata?.responsible_user ||
      metadata?.responsible_email ||
      metadata?.responsible_actor
  );

  const hasAnyPurpose = purpose.event || purpose.training || purpose.distribution;
  const hasDestination =
    destinationMunicipio || destinationGve || destinationSector || destinationOther;
  const hasResponsibleMeta = responsibleAuto || responsibleUser;
  if (!hasAnyPurpose && !hasDestination && !hasResponsibleMeta) return null;

  return {
    purpose_event: purpose.event,
    purpose_training: purpose.training,
    purpose_distribution: purpose.distribution,
    destination_mode: destinationMode,
    destination_municipio: destinationMunicipio || null,
    destination_gve: destinationGve || null,
    destination_sector: destinationSector || null,
    destination_other: destinationOther || null,
    responsible_auto: responsibleAuto,
    responsible_user: responsibleUser || null,
  };
};

export const parseStockMovementNotes = (rawNotes) => {
  const text = String(rawNotes || "");
  const markerIndex = text.lastIndexOf(STOCK_MOVEMENT_META_PREFIX);
  if (markerIndex < 0) {
    return {
      notes: text.trim(),
      metadata: null,
    };
  }

  const cleanNotes = text.slice(0, markerIndex).trim();
  const rawMeta = text.slice(markerIndex + STOCK_MOVEMENT_META_PREFIX.length).trim();
  try {
    const parsedMeta = JSON.parse(rawMeta);
    const metadata = buildSanitizedMetadata(parsedMeta);
    return {
      notes: cleanNotes,
      metadata,
    };
  } catch {
    return {
      notes: text.trim(),
      metadata: null,
    };
  }
};

export const buildStockMovementNotes = (userNotes, metadata) => {
  const cleanNotes = parseStockMovementNotes(userNotes).notes;
  const sanitizedMetadata = buildSanitizedMetadata(metadata);
  if (!sanitizedMetadata) return cleanNotes;
  const metadataText = `${STOCK_MOVEMENT_META_PREFIX}${JSON.stringify(
    sanitizedMetadata
  )}`;
  return cleanNotes ? `${cleanNotes}\n\n${metadataText}` : metadataText;
};

export const getStockMovementPurposeLabels = (metadata) => {
  const purpose = normalizePurpose(metadata);
  const labels = [];
  if (purpose.event) labels.push("Evento");
  if (purpose.training) labels.push("Treinamento");
  if (purpose.distribution) labels.push("Distribuição");
  return labels;
};

export const resolveStockMovementDestination = ({
  metadata,
  fallbackSector,
  getGveByMunicipio,
}) => {
  const fallbackValue = normalizeText(fallbackSector);
  const isFallbackGve = /^gve\s*:/i.test(fallbackValue);
  const isFallbackSetor = /^setor\s*:/i.test(fallbackValue);
  const isFallbackOutros = /^outros\s*:/i.test(fallbackValue);
  const fallbackGve = isFallbackGve
    ? normalizeText(fallbackValue.replace(/^gve\s*:/i, ""))
    : "";
  const fallbackSectorLabel = isFallbackSetor
    ? normalizeText(fallbackValue.replace(/^setor\s*:/i, ""))
    : "";
  const fallbackOther = isFallbackOutros
    ? normalizeText(fallbackValue.replace(/^outros\s*:/i, ""))
    : "";
  const fallbackMunicipio =
    isFallbackGve || isFallbackSetor || isFallbackOutros ? "" : fallbackValue;

  const destinationMode = normalizeDestinationMode(
    metadata?.destination_mode ||
      (fallbackGve
        ? "gve"
        : fallbackSectorLabel
        ? "setor"
        : fallbackOther
        ? "outros"
        : "municipio")
  );
  const destinationMunicipio = normalizeText(
    metadata?.destination_municipio || fallbackMunicipio
  );
  const destinationGve = normalizeText(metadata?.destination_gve || fallbackGve);
  const destinationSector = normalizeText(
    metadata?.destination_sector || fallbackSectorLabel
  );
  const destinationOther = normalizeText(
    metadata?.destination_other || fallbackOther
  );

  if (destinationMode === "setor") {
    return {
      destination: destinationSector || "Setor",
      destinationMode: "setor",
      municipio: null,
      gve: null,
      sector: destinationSector || null,
      other: null,
    };
  }

  if (destinationMode === "outros") {
    return {
      destination: destinationOther || fallbackValue || "-",
      destinationMode: "outros",
      municipio: null,
      gve: null,
      sector: null,
      other: destinationOther || null,
    };
  }

  if (destinationMode === "gve" && destinationGve) {
    return {
      destination: `GVE: ${destinationGve}`,
      destinationMode,
      municipio: destinationMunicipio || null,
      gve: destinationGve,
      sector: null,
      other: null,
    };
  }

  const resolvedGve =
    destinationGve ||
    normalizeText(
      typeof getGveByMunicipio === "function"
        ? getGveByMunicipio(destinationMunicipio)
        : ""
    );

  return {
    destination: destinationMunicipio || fallbackValue || "-",
    destinationMode: "municipio",
    municipio: destinationMunicipio || null,
    gve: resolvedGve || null,
    sector: null,
    other: null,
  };
};
