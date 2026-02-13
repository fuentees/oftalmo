import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";

export const normalizeGveText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const normalizeGveMappingRows = (rows) => {
  const unique = [];
  const seen = new Set();
  (rows || []).forEach((item) => {
    const id = String(item?.id || "").trim();
    const municipio = String(item?.municipio || "").trim();
    const gve = String(item?.gve || "").trim();
    if (!municipio || !gve) return;
    const key = normalizeGveText(municipio);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(id ? { id, municipio, gve } : { municipio, gve });
  });
  return unique.sort((a, b) =>
    a.municipio.localeCompare(b.municipio, "pt-BR", { sensitivity: "base" })
  );
};

export const buildGveMap = (rows) => {
  const map = new Map();
  rows.forEach((item) => {
    const key = normalizeGveText(item.municipio);
    if (!key || map.has(key)) return;
    map.set(key, String(item.gve || "").trim());
  });
  return map;
};

export function useGveMapping() {
  const query = useQuery({
    queryKey: ["gve-mapping"],
    queryFn: () => dataClient.integrations.Core.ListMunicipalityGveMapping(),
    staleTime: 5 * 60 * 1000,
  });

  const gveMapping = useMemo(
    () => normalizeGveMappingRows(query.data || []),
    [query.data]
  );
  const gveMap = useMemo(() => buildGveMap(gveMapping), [gveMapping]);
  const municipalityOptions = useMemo(
    () => gveMapping.map((item) => item.municipio),
    [gveMapping]
  );

  const getGveByMunicipio = useCallback(
    (municipio) => {
      const key = normalizeGveText(municipio);
      if (!key) return "";
      return gveMap.get(key) || "";
    },
    [gveMap]
  );

  return {
    ...query,
    gveMapping,
    municipalityOptions,
    getGveByMunicipio,
  };
}
