import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { differenceInDays, parseISO, isValid } from "date-fns";

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const d = new Date(`${match[1]}T00:00:00`);
    return isValid(d) ? d : null;
  }
  try {
    const d = parseISO(text);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

function getFirstTrainingDate(training) {
  const dates = Array.isArray(training.dates) ? training.dates : [];
  const candidates = [];
  const base = parseDate(training.date);
  if (base) candidates.push(base);
  dates.forEach((item) => {
    const v = typeof item === "object" ? item?.date : item;
    const d = parseDate(v);
    if (d) candidates.push(d);
  });
  if (!candidates.length) return null;
  return candidates.reduce((min, d) => (d < min ? d : min));
}

export function useNotifications() {
  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
    staleTime: 60_000,
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
    staleTime: 60_000,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants-notifications"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
    staleTime: 60_000,
  });

  const notifications = useMemo(() => {
    const items = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- Estoque baixo ---
    const lowStock = materials.filter(
      (m) =>
        m.current_stock != null &&
        m.minimum_stock != null &&
        m.current_stock <= m.minimum_stock
    );
    if (lowStock.length > 0) {
      lowStock.slice(0, 5).forEach((m) => {
        items.push({
          id: `low-stock-${m.id}`,
          type: "stock",
          priority: "high",
          title: "Estoque crítico",
          message: `${m.name}: ${m.current_stock} ${m.unit || "un"} (mínimo: ${m.minimum_stock})`,
          link: "Stock",
        });
      });
      if (lowStock.length > 5) {
        items.push({
          id: "low-stock-more",
          type: "stock",
          priority: "high",
          title: "Estoque crítico",
          message: `Mais ${lowStock.length - 5} materiais abaixo do mínimo.`,
          link: "Stock",
        });
      }
    }

    // --- Treinamentos nos próximos 7 dias ---
    const upcoming = trainings.filter((t) => {
      if (t.status === "cancelado" || t.status === "concluido") return false;
      const d = getFirstTrainingDate(t);
      if (!d) return false;
      const diff = differenceInDays(d, today);
      return diff >= 0 && diff <= 7;
    });
    upcoming.forEach((t) => {
      const d = getFirstTrainingDate(t);
      const diff = differenceInDays(d, today);
      const maxP = t.max_participants;
      const currP = t.participants_count || 0;
      const spotsLeft = maxP ? maxP - currP : null;

      items.push({
        id: `upcoming-${t.id}`,
        type: "training",
        priority: diff <= 2 ? "high" : "medium",
        title: diff === 0 ? "Treinamento hoje" : `Treinamento em ${diff} dia${diff > 1 ? "s" : ""}`,
        message: `${t.title}${spotsLeft != null ? ` · ${spotsLeft} vaga${spotsLeft !== 1 ? "s" : ""} disponível` : ""}`,
        link: "Trainings",
        trainingId: t.id,
      });
    });

    // --- Treinamentos lotados ---
    const full = trainings.filter(
      (t) =>
        t.max_participants > 0 &&
        (t.participants_count || 0) >= t.max_participants &&
        t.status !== "cancelado" &&
        t.status !== "concluido"
    );
    if (full.length > 0) {
      items.push({
        id: "full-trainings",
        type: "training",
        priority: "medium",
        title: "Treinamentos lotados",
        message: `${full.length} treinamento${full.length > 1 ? "s" : ""} com vagas esgotadas.`,
        link: "Trainings",
      });
    }

    // --- Inscrições pendentes de aprovação ---
    const pending = participants.filter(
      (p) =>
        String(p.enrollment_status || "").toLowerCase() === "pendente"
    );
    if (pending.length > 0) {
      items.push({
        id: "pending-enrollments",
        type: "enrollment",
        priority: "medium",
        title: "Inscrições pendentes",
        message: `${pending.length} inscrição${pending.length > 1 ? "ões" : ""} aguardando aprovação.`,
        link: "Trainings",
      });
    }

    // --- Validades expirando em 7 dias ---
    const expiringValidity = participants.filter((p) => {
      if (!p.validity_date || !p.approved) return false;
      const d = parseDate(p.validity_date);
      if (!d) return false;
      const diff = differenceInDays(d, today);
      return diff >= 0 && diff <= 7;
    });
    if (expiringValidity.length > 0) {
      items.push({
        id: "expiring-validity",
        type: "validity",
        priority: "medium",
        title: "Validades expirando",
        message: `${expiringValidity.length} certificado${expiringValidity.length > 1 ? "s" : ""} expira${expiringValidity.length > 1 ? "m" : ""} em até 7 dias.`,
        link: "Participants",
      });
    }

    return items.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
    });
  }, [materials, trainings, participants]);

  return { notifications, count: notifications.length };
}
