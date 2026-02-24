import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useGveMapping } from "@/hooks/useGveMapping";
import { parseDateSafe } from "@/lib/date";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
import {
  buildEventNotes,
  extractTrainingIdFromEventNotes,
} from "@/lib/eventMetadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X, Video, Plus, XCircle, Mic } from "lucide-react";
import { format, addDays, addWeeks } from "date-fns";

export default function TrainingForm({ training, onClose, professionals = [] }) {
  const buildDefaultRangeConfig = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      start_date: today,
      end_date: today,
      start_time: "08:00",
      end_time: "12:00",
    };
  };

  const parseTimeToMinutes = (value) => {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    return hour * 60 + minute;
  };

  const buildRangeDates = ({ start_date, end_date, start_time, end_time }) => {
    const start = start_date ? parseDateSafe(start_date) : null;
    const end = end_date ? parseDateSafe(end_date) : null;
    if (
      !start ||
      !end ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return [];
    }

    const first =
      start.getTime() <= end.getTime()
        ? new Date(start.getTime())
        : new Date(end.getTime());
    const last =
      start.getTime() <= end.getTime()
        ? new Date(end.getTime())
        : new Date(start.getTime());

    const dates = [];
    let cursor = new Date(first.getTime());
    let safetyCounter = 0;
    while (cursor.getTime() <= last.getTime() && safetyCounter < 370) {
      dates.push({
        date: format(cursor, "yyyy-MM-dd"),
        start_time: start_time || "",
        end_time: end_time || "",
      });
      cursor = addDays(cursor, 1);
      safetyCounter += 1;
    }
    return dates;
  };

  const areDateListsEqual = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const itemA = a[i] || {};
      const itemB = b[i] || {};
      if (
        String(itemA.date || "") !== String(itemB.date || "") ||
        String(itemA.start_time || "") !== String(itemB.start_time || "") ||
        String(itemA.end_time || "") !== String(itemB.end_time || "")
      ) {
        return false;
      }
    }
    return true;
  };

  const inferScheduleFromDates = (dates) => {
    const sanitized = (Array.isArray(dates) ? dates : [])
      .filter((item) => item?.date)
      .map((item) => ({
        date: String(item.date),
        start_time: String(item.start_time || ""),
        end_time: String(item.end_time || ""),
      }));
    if (sanitized.length === 0) {
      return {
        mode: "range",
        range: buildDefaultRangeConfig(),
      };
    }
    const sorted = [...sanitized].sort((a, b) => {
      const dateA = parseDateSafe(a.date);
      const dateB = parseDateSafe(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const sameTime = sorted.every(
      (item) =>
        String(item.start_time || "") === String(first.start_time || "") &&
        String(item.end_time || "") === String(first.end_time || "")
    );
    const sequential = sorted.every((item, index) => {
      if (index === 0) return true;
      const prev = parseDateSafe(sorted[index - 1].date);
      const curr = parseDateSafe(item.date);
      if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) {
        return false;
      }
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      return diffDays === 1;
    });

    return {
      mode: sameTime && sequential ? "range" : "custom",
      range: {
        start_date: String(first.date || ""),
        end_date: String(last.date || first.date || ""),
        start_time: String(first.start_time || "08:00"),
        end_time: String(first.end_time || "12:00"),
      },
    };
  };

  const calculateDurationHours = (dates) => {
    const totalMinutes = (Array.isArray(dates) ? dates : []).reduce(
      (acc, item) => {
        const startMinutes = parseTimeToMinutes(item?.start_time);
        const endMinutes = parseTimeToMinutes(item?.end_time);
        if (startMinutes === null || endMinutes === null) return acc;
        let diff = endMinutes - startMinutes;
        if (diff < 0) diff += 24 * 60;
        return acc + diff;
      },
      0
    );
    return Math.round((totalMinutes / 60) * 100) / 100;
  };

  const toNormalizedDate = (value) => {
    if (!value) return "";
    if (typeof value === "string") {
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    const parsed = parseDateSafe(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return format(parsed, "yyyy-MM-dd");
  };

  const normalizeTrainingDates = (dates, fallbackTimes = {}) => {
    const items = Array.isArray(dates) ? dates : [];
    return items
      .map((item) => {
        const rawDate = typeof item === "object" ? item?.date : item;
        const date = toNormalizedDate(rawDate);
        if (!date) return null;
        const start_time =
          String(
            (typeof item === "object" ? item?.start_time : "") ||
              fallbackTimes?.start_time ||
              "08:00"
          ).trim() || "08:00";
        const end_time =
          String(
            (typeof item === "object" ? item?.end_time : "") ||
              fallbackTimes?.end_time ||
              "12:00"
          ).trim() || "12:00";
        return { date, start_time, end_time };
      })
      .filter(Boolean);
  };

  const buildLegacyDatesFromTraining = (trainingItem) => {
    if (!trainingItem) return [];
    const startDate = toNormalizedDate(trainingItem?.start_date || trainingItem?.date);
    const endDate = toNormalizedDate(trainingItem?.end_date || trainingItem?.date);
    const start_time = String(trainingItem?.start_time || "08:00").trim() || "08:00";
    const end_time = String(trainingItem?.end_time || "12:00").trim() || "12:00";
    if (!startDate && !endDate) return [];
    return buildRangeDates({
      start_date: startDate || endDate,
      end_date: endDate || startDate,
      start_time,
      end_time,
    });
  };

  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const [formData, setFormData] = useState({
    title: "",
    code: "",
    type: "teorico",
    description: "",
    dates: [{ date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }],
    duration_hours: 4,
    location: "",
    municipality: "",
    gve: "",
    online_link: "",
    coordinator: "",
    coordinator_email: "",
    instructor: "",
    monitors: [],
    speakers: [],
    max_participants: "",
    status: "agendado",
    validity_months: "",
    notes: "",
  });
  const [isOnlineTraining, setIsOnlineTraining] = useState(false);
  const [dateMode, setDateMode] = useState("range");
  const [rangeConfig, setRangeConfig] = useState(buildDefaultRangeConfig());

  const [repeatConfig, setRepeatConfig] = useState({
    enabled: false,
    type: "daily",
    occurrences: 5,
  });

  const queryClient = useQueryClient();
  const { municipalityOptions, getGveByMunicipio } = useGveMapping();
  const trainingId = String(training?.id || "").trim();

  const { data: completeTraining } = useQuery({
    queryKey: ["training-form-complete", trainingId],
    queryFn: async () => {
      const rows = await dataClient.entities.Training.filter({ id: trainingId });
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
      return training || null;
    },
    enabled: Boolean(trainingId),
  });

  useEffect(() => {
    const defaultDates = [
      { date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }
    ];

    const sourceTraining = completeTraining || training;

    if (sourceTraining) {
      const normalizedDates = normalizeTrainingDates(sourceTraining?.dates, {
        start_time: sourceTraining?.start_time,
        end_time: sourceTraining?.end_time,
      });
      const legacyDates =
        normalizedDates.length > 0
          ? []
          : buildLegacyDatesFromTraining(sourceTraining);
      const resolvedDates =
        normalizedDates.length > 0
          ? normalizedDates
          : legacyDates.length > 0
          ? legacyDates
          : defaultDates;
      const parsedLocation = parseLocation(sourceTraining.location);
      const resolvedMunicipality =
        String(sourceTraining?.municipality || "").trim() || parsedLocation.municipality;
      const resolvedGve =
        String(sourceTraining?.gve || "").trim() || parsedLocation.gve;
      const resolvedOnlineLink = String(sourceTraining?.online_link || "").trim();
      const scheduleFromTraining = inferScheduleFromDates(
        resolvedDates
      );

      setFormData({
        title: sourceTraining.title || "",
        code: sourceTraining.code || "",
        type: sourceTraining.type || "teorico",
        description: sourceTraining.description || "",
        dates: resolvedDates,
        duration_hours:
          Number.isFinite(Number(sourceTraining.duration_hours))
            ? Number(sourceTraining.duration_hours)
            : calculateDurationHours(resolvedDates),
        location: sourceTraining.location || "",
        municipality: resolvedMunicipality,
        gve: resolvedGve,
        online_link: resolvedOnlineLink,
        coordinator: sourceTraining.coordinator || "",
        coordinator_email: sourceTraining.coordinator_email || "",
        instructor: sourceTraining.instructor || "",
        monitors: toArray(sourceTraining.monitors),
        speakers: toArray(sourceTraining.speakers),
        max_participants:
          sourceTraining.max_participants === null ||
          sourceTraining.max_participants === undefined
            ? ""
            : String(sourceTraining.max_participants),
        status: sourceTraining.status || "agendado",
        validity_months:
          sourceTraining.validity_months === null ||
          sourceTraining.validity_months === undefined
            ? ""
            : String(sourceTraining.validity_months),
        notes: sourceTraining.notes || "",
      });
      setIsOnlineTraining(Boolean(resolvedOnlineLink));
      setDateMode(scheduleFromTraining.mode);
      setRangeConfig(scheduleFromTraining.range);
    } else {
      // Generate code for new training
      generateTrainingCode();
      setIsOnlineTraining(false);
      setDateMode("range");
      setRangeConfig(buildDefaultRangeConfig());
      setFormData((prev) => ({
        ...prev,
        dates: buildRangeDates(buildDefaultRangeConfig()),
        duration_hours: 4,
      }));
    }
  }, [training, completeTraining]);

  useEffect(() => {
    if (dateMode !== "range") return;
    const generatedDates = buildRangeDates(rangeConfig);
    if (!generatedDates.length) return;
    setFormData((prev) => {
      if (areDateListsEqual(prev.dates || [], generatedDates)) return prev;
      return {
        ...prev,
        dates: generatedDates,
      };
    });
  }, [dateMode, rangeConfig]);

  useEffect(() => {
    const nextDuration = calculateDurationHours(formData.dates);
    setFormData((prev) => {
      const current = Number(prev.duration_hours || 0);
      if (current === nextDuration) return prev;
      return {
        ...prev,
        duration_hours: nextDuration,
      };
    });
  }, [formData.dates]);

  const generateTrainingCode = async () => {
    const currentYear = new Date().getFullYear();
    const trainings = await dataClient.entities.Training.list();
    
    // Filter trainings from current year
    const yearTrainings = trainings.filter(t => {
      const trainingYear = t.code?.split('-')[1];
      return trainingYear === String(currentYear);
    });
    
    const nextNumber = yearTrainings.length + 1;
    const code = `${String(nextNumber).padStart(2, '0')}-${currentYear}`;
    
    setFormData(prev => ({ ...prev, code }));
  };

  const getTrainingDateRange = (dates = []) => {
    const parsedDates = (dates || [])
      .map((item) => {
        const raw = item?.date;
        if (!raw) return null;
        const parsed = parseDateSafe(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return {
          date: raw,
          start_time: item?.start_time || "",
          end_time: item?.end_time || "",
          value: parsed.getTime(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.value - b.value);
    if (!parsedDates.length) return {};
    const first = parsedDates[0];
    const last = parsedDates[parsedDates.length - 1];
    return {
      start_date: first.date,
      end_date: last.date,
      start_time: first.start_time,
      end_time: last.end_time,
    };
  };

  const mapTrainingStatusToEvent = (status) => {
    if (status === "concluido") return "concluido";
    if (status === "em_andamento") return "em_andamento";
    if (status === "cancelado") return "cancelado";
    return "planejado";
  };

  const buildEventPayload = (payload) => {
    const dateRange = getTrainingDateRange(payload.dates || []);
    const professionalNames = [
      payload.coordinator,
      payload.instructor,
      ...(payload.monitors || []).map((monitor) => monitor?.name),
      ...(payload.speakers || []).map((speaker) => speaker?.name),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    return {
      title: payload.title || "Treinamento",
      type: "treinamento",
      description: payload.description || "",
      start_date: dateRange.start_date || payload.date || null,
      end_date: dateRange.end_date || payload.date || null,
      start_time: dateRange.start_time || "",
      end_time: dateRange.end_time || "",
      location: payload.location || "",
      professional_names: professionalNames.length ? professionalNames : null,
      status: mapTrainingStatusToEvent(payload.status),
      color: "#6366f1",
      notes: buildEventNotes({
        notes: payload.notes,
        onlineLink: payload.online_link,
      }),
    };
  };

  const normalizeComparisonText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const getPayloadStartDate = (payload) => {
    if (Array.isArray(payload?.dates)) {
      const firstWithDate = payload.dates.find((item) => item?.date);
      if (firstWithDate?.date) return String(firstWithDate.date);
    }
    if (payload?.date) return String(payload.date);
    return "";
  };

  const findLegacyTrainingEvent = (events, payload) => {
    const expectedTitle = normalizeComparisonText(payload?.title);
    const expectedStartDate = getPayloadStartDate(payload);
    return (events || []).find((item) => {
      if (!item?.id) return false;
      if (String(item.type || "") !== "treinamento") return false;
      if (extractTrainingIdFromEventNotes(item.notes)) return false;
      const sameTitle =
        normalizeComparisonText(item.title) === expectedTitle;
      if (!sameTitle) return false;
      if (!expectedStartDate) return true;
      return String(item.start_date || "") === expectedStartDate;
    });
  };

  const saveTraining = useMutation({
    mutationFn: async (/** @type {any} */ data) => {
      if (training) {
        const updated = await dataClient.entities.Training.update(
          training.id,
          data
        );
        try {
          const trainingEvents = await dataClient.entities.Event.filter(
            { type: "treinamento" },
            "-start_date"
          );
          const linkedEvents = trainingEvents.filter(
            (item) =>
              extractTrainingIdFromEventNotes(item.notes) === training.id
          );
          const eventPayload = {
            ...buildEventPayload(data),
            notes: buildEventNotes({
              notes: data.notes,
              onlineLink: data.online_link,
              trainingId: training.id,
            }),
          };
          if (linkedEvents.length > 0) {
            await Promise.all(
              linkedEvents.map((item) =>
                dataClient.entities.Event.update(item.id, eventPayload)
              )
            );
          } else {
            const legacyEvent =
              findLegacyTrainingEvent(trainingEvents, training) ||
              findLegacyTrainingEvent(trainingEvents, data);
            if (legacyEvent?.id) {
              await dataClient.entities.Event.update(legacyEvent.id, eventPayload);
            } else {
              await dataClient.entities.Event.create(eventPayload);
            }
          }
        } catch (error) {
          console.error("Falha ao sincronizar evento do treinamento:", error);
        }
        return updated;
      }
      const created = await dataClient.entities.Training.create(data);
      try {
        await dataClient.entities.Event.create({
          ...buildEventPayload(data),
          notes: buildEventNotes({
            notes: data.notes,
            onlineLink: data.online_link,
            trainingId: created.id,
          }),
        });
      } catch (error) {
        console.error("Falha ao criar evento do treinamento:", error);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Auto-calculate status based on dates and times.
    const dateRange = getTrainingDateRange(formData.dates || []);
    const autoStatus = getEffectiveTrainingStatus({
      ...formData,
      date: dateRange.start_date || formData.date,
      dates: formData.dates || [],
    });
    
    const { municipality, gve, ...restForm } = formData;
    const resolvedGve = isOnlineTraining
      ? ""
      : getGveByMunicipio(municipality) || gve;
    const normalizedOnlineLink = isOnlineTraining
      ? String(formData.online_link || "").trim()
      : null;
    const durationHours = Number(formData.duration_hours);
    const dataToSave = {
      ...restForm,
      location: isOnlineTraining ? "" : buildLocation(municipality, resolvedGve),
      online_link: normalizedOnlineLink,
      date: dateRange.start_date || null,
      status: autoStatus,
      duration_hours: Number.isFinite(durationHours) ? durationHours : null,
      max_participants: formData.max_participants ? Number(formData.max_participants) : null,
      validity_months: formData.validity_months ? Number(formData.validity_months) : null,
      coordinator_email: formData.coordinator_email || null,
    };
    saveTraining.mutate(dataToSave);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const activeProfessionals = useMemo(
    () => (professionals || []).filter(
      (prof) => String(prof?.status || "").trim().toLowerCase() !== "inativo"
    ),
    [professionals]
  );

  const parseLocation = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return { municipality: "", gve: "" };
    const hasGve = /gve/i.test(raw);
    if (!hasGve) return { municipality: raw, gve: "" };
    const match = raw.match(/^(.*?)\s*(?:-|•|\|)?\s*GVE\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        municipality: String(match[1] || "").trim(),
        gve: String(match[2] || "").trim(),
      };
    }
    return { municipality: raw, gve: "" };
  };

  const buildLocation = (municipalityValue, gveValue) => {
    const cleanMunicipality = String(municipalityValue || "").trim();
    const cleanGve = String(gveValue || "").trim();
    if (cleanMunicipality && cleanGve) {
      return `${cleanMunicipality} - GVE ${cleanGve}`;
    }
    if (cleanMunicipality) return cleanMunicipality;
    if (cleanGve) return `GVE ${cleanGve}`;
    return "";
  };

  const findProfessionalByName = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    return (
      activeProfessionals.find(
        (prof) => normalizeText(prof.name) === normalized
      ) || null
    );
  };

  const findProfessionalByEmail = (email) => {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    return activeProfessionals.find(
      (prof) => prof.email?.trim().toLowerCase() === normalized
    );
  };

  const findProfessionalByRg = (rg) => {
    if (!rg) return null;
    const normalized = rg.replace(/\D/g, "");
    return activeProfessionals.find(
      (prof) => String(prof.rg || "").replace(/\D/g, "") === normalized
    );
  };

  const addDate = () => {
    setFormData((prev) => {
      const lastDate = prev.dates[prev.dates.length - 1]?.date;
      const base = lastDate ? parseDateSafe(lastDate) : new Date();
      const next = Number.isNaN(base.getTime()) ? new Date() : addDays(base, 1);
      const nextDate = format(next, "yyyy-MM-dd");
      return {
        ...prev,
        dates: [
          ...prev.dates,
          { date: nextDate, start_time: "08:00", end_time: "12:00" },
        ],
      };
    });
  };

  const removeDate = (index) => {
    if (formData.dates.length > 1) {
      setFormData(prev => ({
        ...prev,
        dates: prev.dates.filter((_, i) => i !== index)
      }));
    }
  };

  const updateDate = (index, field, value) => {
    if (field === "date" && index === 0) {
      setFormData((prev) => {
        const previousValue = prev.dates[0]?.date;
        const prevDate = previousValue ? parseDateSafe(previousValue) : null;
        const nextDate = value ? parseDateSafe(value) : null;
        const deltaDays =
          prevDate &&
          nextDate &&
          !Number.isNaN(prevDate.getTime()) &&
          !Number.isNaN(nextDate.getTime())
            ? Math.round((nextDate.getTime() - prevDate.getTime()) / 86400000)
            : 0;
        const updatedDates = prev.dates.map((dateItem, dateIndex) => {
          if (dateIndex === 0) {
            return { ...dateItem, date: value };
          }
          if (!deltaDays || !dateItem?.date) return dateItem;
          const parsed = parseDateSafe(dateItem.date);
          if (Number.isNaN(parsed.getTime())) return dateItem;
          const shifted = addDays(parsed, deltaDays);
          return { ...dateItem, date: format(shifted, "yyyy-MM-dd") };
        });
        return { ...prev, dates: updatedDates };
      });
      return;
    }
    setFormData((prev) => ({
      ...prev,
      dates: prev.dates.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    }));
  };

  const generateRepeatDates = () => {
    if (!formData.dates[0]) return;
    
    const baseDate = parseDateSafe(formData.dates[0].date);
    const startTime = formData.dates[0].start_time;
    const endTime = formData.dates[0].end_time;
    const newDates = [formData.dates[0]];

    for (let i = 1; i < repeatConfig.occurrences; i++) {
      let nextDate;
      
      switch (repeatConfig.type) {
        case "daily":
          nextDate = addDays(baseDate, i);
          break;
        case "weekly":
          nextDate = addWeeks(baseDate, i);
          break;
        case "biweekly":
          nextDate = addWeeks(baseDate, i * 2);
          break;
        case "monthly":
          nextDate = new Date(baseDate);
          nextDate.setMonth(baseDate.getMonth() + i);
          break;
        default:
          nextDate = addDays(baseDate, i);
      }
      
      newDates.push({
        date: format(nextDate, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: endTime,
      });
    }

    setFormData(prev => ({ ...prev, dates: newDates }));
    setRepeatConfig(prev => ({ ...prev, enabled: false }));
  };

  const handleDateModeChange = (mode) => {
    if (mode === dateMode) return;
    if (mode === "range") {
      const inferred = inferScheduleFromDates(formData.dates);
      setRangeConfig(inferred.range);
      setRepeatConfig((prev) => ({ ...prev, enabled: false }));
      setDateMode("range");
      return;
    }
    setDateMode("custom");
  };

  const handleRangeChange = (field, value) => {
    setRangeConfig((prev) => {
      const next = { ...prev, [field]: value };
      const start = next.start_date ? parseDateSafe(next.start_date) : null;
      const end = next.end_date ? parseDateSafe(next.end_date) : null;
      if (
        start &&
        end &&
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        start.getTime() > end.getTime()
      ) {
        if (field === "start_date") {
          next.end_date = next.start_date;
        } else if (field === "end_date") {
          next.start_date = next.end_date;
        }
      }
      return next;
    });
  };

  const currentDateRange = getTrainingDateRange(formData.dates || []);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            value={formData.code}
            disabled
            className="bg-slate-50"
          />
          <p className="text-xs text-slate-500">Gerado automaticamente</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange("title", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo *</Label>
          <Select value={formData.type} onValueChange={(v) => handleChange("type", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="teorico">Teórico</SelectItem>
              <SelectItem value="pratico">Prático</SelectItem>
              <SelectItem value="teorico_pratico">Teórico e Prático</SelectItem>
              <SelectItem value="repadronizacao">Repadronização</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição/Conteúdo</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Label>Programação do Treinamento *</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={dateMode === "range" ? "default" : "outline"}
              onClick={() => handleDateModeChange("range")}
            >
              Período (Início/Fim)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dateMode === "custom" ? "default" : "outline"}
              onClick={() => handleDateModeChange("custom")}
            >
              Incluir Datas
            </Button>
          </div>
        </div>

        {dateMode === "range" ? (
          <div className="p-3 border rounded-lg bg-slate-50 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Data de Início</Label>
                <Input
                  type="date"
                  value={rangeConfig.start_date}
                  onChange={(e) => handleRangeChange("start_date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Fim</Label>
                <Input
                  type="date"
                  value={rangeConfig.end_date}
                  onChange={(e) => handleRangeChange("end_date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Horário de Início</Label>
                <Input
                  type="time"
                  value={rangeConfig.start_time}
                  onChange={(e) => handleRangeChange("start_time", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Horário de Término</Label>
                <Input
                  type="time"
                  value={rangeConfig.end_time}
                  onChange={(e) => handleRangeChange("end_time", e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {formData.dates.length} data(s) gerada(s) automaticamente para o período.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-600">
                Datas alternadas e horários diferentes
              </Label>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setRepeatConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                >
                  🔁 Repetir
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addDate}>
                  + Adicionar Data
                </Button>
              </div>
            </div>

            {repeatConfig.enabled && (
              <div className="p-3 border rounded-lg bg-blue-50 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Frequência</Label>
                    <Select 
                      value={repeatConfig.type} 
                      onValueChange={(v) => setRepeatConfig(prev => ({ ...prev, type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                        <SelectItem value="biweekly">Quinzenalmente</SelectItem>
                        <SelectItem value="monthly">Mensalmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ocorrências</Label>
                    <Input
                      type="number"
                      min="2"
                      max="30"
                      value={repeatConfig.occurrences}
                      onChange={(e) => setRepeatConfig(prev => ({ ...prev, occurrences: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" onClick={generateRepeatDates} size="sm" className="w-full">
                      Gerar Datas
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {formData.dates.map((dateItem, index) => (
              <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-slate-50">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={dateItem.date}
                      onChange={(e) => updateDate(index, "date", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <Input
                      type="time"
                      value={dateItem.start_time}
                      onChange={(e) => updateDate(index, "start_time", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Término</Label>
                    <Input
                      type="time"
                      value={dateItem.end_time}
                      onChange={(e) => updateDate(index, "end_time", e.target.value)}
                      required
                    />
                  </div>
                </div>
                {formData.dates.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDate(index)}
                    className="text-red-600 mt-5"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </>
        )}

        {currentDateRange.start_date && currentDateRange.end_date && (
          <p className="text-xs text-slate-500">
            Início: {currentDateRange.start_date} • Fim: {currentDateRange.end_date}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="duration_hours">Carga Horária (h)</Label>
          <Input
            id="duration_hours"
            type="number"
            min="0"
            step="0.5"
            value={formData.duration_hours}
            readOnly
            className="bg-slate-50"
          />
          <p className="text-xs text-slate-500">
            Calculada automaticamente com base nos horários informados.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Modalidade do treinamento</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={isOnlineTraining ? "default" : "outline"}
            onClick={() => setIsOnlineTraining(true)}
            className="h-9"
          >
            <Video className="h-4 w-4 mr-2" />
            Online
          </Button>
          <Button
            type="button"
            variant={!isOnlineTraining ? "default" : "outline"}
            onClick={() => setIsOnlineTraining(false)}
            className="h-9"
          >
            Presencial
          </Button>
        </div>
      </div>

      {isOnlineTraining ? (
        <div className="space-y-1.5">
          <Label htmlFor="online_link" className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4 text-blue-600" />
            Link da Reunião Online (Zoom/Teams) *
          </Label>
          <Input
            id="online_link"
            value={formData.online_link}
            onChange={(e) => handleChange("online_link", e.target.value)}
            placeholder="https://zoom.us/j/... ou https://teams.microsoft.com/..."
            required={isOnlineTraining}
          />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="municipality">Município</Label>
            <Input
              id="municipality"
              list="municipios-treinamento"
              value={formData.municipality}
              onChange={(e) => {
                const nextValue = e.target.value;
                const autoGve = getGveByMunicipio(nextValue);
                setFormData((prev) => ({
                  ...prev,
                  municipality: nextValue,
                  gve: autoGve || "",
                }));
              }}
              placeholder="Digite o município"
            />
            {municipalityOptions.length > 0 && (
              <datalist id="municipios-treinamento">
                {municipalityOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gve">GVE</Label>
            <Input
              id="gve"
              value={getGveByMunicipio(formData.municipality) || formData.gve}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  gve: e.target.value,
                }))
              }
              placeholder="GVE"
              readOnly={Boolean(getGveByMunicipio(formData.municipality))}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="coordinator">Coordenador</Label>
        <Input
          id="coordinator"
          list="professionals-names"
          value={formData.coordinator}
          onChange={(e) => {
            const nextValue = e.target.value;
            const match = findProfessionalByName(nextValue);
            setFormData((prev) => ({
              ...prev,
              coordinator: nextValue,
              coordinator_email: prev.coordinator_email || match?.email || "",
            }));
          }}
          placeholder="Nome do coordenador"
        />
        <Input
          id="coordinator_email"
          type="email"
          list="professionals-emails"
          value={formData.coordinator_email}
          onChange={(e) => {
            const nextValue = e.target.value;
            const match = findProfessionalByEmail(nextValue);
            setFormData((prev) => ({
              ...prev,
              coordinator_email: nextValue,
              coordinator: prev.coordinator || match?.name || "",
            }));
          }}
          placeholder="Email do coordenador (opcional)"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Monitores</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChange("monitors", [...formData.monitors, { name: "", email: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Monitor
          </Button>
        </div>
        {formData.monitors.map((monitor, index) => (
          <div key={index} className="flex gap-2 p-2 border rounded-lg">
            <Input
              value={monitor.name}
              list="professionals-names"
              onChange={(e) => {
                const newMonitors = [...formData.monitors];
                const nextValue = e.target.value;
                const match = findProfessionalByName(nextValue);
                newMonitors[index].name = nextValue;
                if (!newMonitors[index].email && match?.email) {
                  newMonitors[index].email = match.email;
                }
                handleChange("monitors", newMonitors);
              }}
              placeholder="Nome do monitor"
            />
            <Input
              type="email"
              value={monitor.email}
              list="professionals-emails"
              onChange={(e) => {
                const newMonitors = [...formData.monitors];
                newMonitors[index].email = e.target.value;
                handleChange("monitors", newMonitors);
              }}
              placeholder="Email do monitor"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const newMonitors = formData.monitors.filter((_, i) => i !== index);
                handleChange("monitors", newMonitors);
              }}
              className="text-red-600"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm flex items-center gap-2">
            <Mic className="h-4 w-4 text-amber-600" />
            Palestrantes
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              handleChange("speakers", [
                ...formData.speakers,
                { name: "", rg: "", email: "", lecture: "" },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Palestrante
          </Button>
        </div>
        {formData.speakers.map((speaker, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 border rounded-lg">
            <Input
              value={speaker.name}
              list="professionals-names"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByName(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].name = nextValue;
                if (!newSpeakers[index].email && match?.email) {
                  newSpeakers[index].email = match.email;
                }
                if (!newSpeakers[index].rg && match?.rg) {
                  newSpeakers[index].rg = match.rg;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Nome do palestrante"
            />
            <Input
              value={speaker.rg}
              list="professionals-rg"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByRg(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].rg = nextValue;
                if (!newSpeakers[index].name && match?.name) {
                  newSpeakers[index].name = match.name;
                }
                if (!newSpeakers[index].email && match?.email) {
                  newSpeakers[index].email = match.email;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="RG do palestrante"
            />
            <Input
              type="email"
              value={speaker.email}
              list="professionals-emails"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByEmail(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].email = nextValue;
                if (!newSpeakers[index].name && match?.name) {
                  newSpeakers[index].name = match.name;
                }
                if (!newSpeakers[index].rg && match?.rg) {
                  newSpeakers[index].rg = match.rg;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Email do palestrante"
            />
            <Input
              value={speaker.lecture}
              onChange={(e) => {
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].lecture = e.target.value;
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Aula/tema a ser ministrada"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const newSpeakers = formData.speakers.filter((_, i) => i !== index);
                handleChange("speakers", newSpeakers);
              }}
              className="text-red-600 justify-self-end"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <datalist id="professionals-names">
        {activeProfessionals.map((prof) => (
          <option key={prof.id} value={prof.name} />
        ))}
      </datalist>
      <datalist id="professionals-emails">
        {activeProfessionals
          .filter((prof) => prof.email)
          .map((prof) => (
            <option key={prof.id} value={prof.email} />
          ))}
      </datalist>
      <datalist id="professionals-rg">
        {activeProfessionals
          .filter((prof) => prof.rg)
          .map((prof) => (
            <option key={prof.id} value={prof.rg} />
          ))}
      </datalist>
      <div className="space-y-1.5">
        <Label htmlFor="max_participants">Capacidade Máxima</Label>
        <Input
          id="max_participants"
          type="number"
          min="1"
          value={formData.max_participants}
          onChange={(e) => handleChange("max_participants", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="validity_months">Validade (meses)</Label>
        <Input
          id="validity_months"
          type="number"
          min="1"
          value={formData.validity_months}
          onChange={(e) => handleChange("validity_months", e.target.value)}
          placeholder="Ex: 12"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white pb-2 border-t mt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveTraining.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveTraining.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {training ? "Salvar Alterações" : "Cadastrar Treinamento"}
        </Button>
      </div>
    </form>
  );
}