import React, { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Palette,
  Check,
  FileSpreadsheet,
  Trash2,
  Download,
  FileText,
  Eye,
  Database,
  Info,
  Mail,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataExport from "@/components/settings/DataExport";
import UserManagementPanel from "@/components/settings/UserManagementPanel";
import { dataClient } from "@/api/dataClient";
import { normalizeGveMappingRows, useGveMapping } from "@/hooks/useGveMapping";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import {
  DEFAULT_CERTIFICATE_TEMPLATE,
  loadCertificateTemplate,
  resetCertificateTemplate,
  saveCertificateTemplate,
  saveCertificateTemplateToStorage,
  saveCertificateTemplateForTraining,
  resetCertificateTemplateForTraining,
  resolveCertificateTemplate,
  isCertificateTemplateCloudSyncDisabled,
} from "@/lib/certificateTemplate";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  loadCertificateEmailTemplate,
  resetCertificateEmailTemplate,
  saveCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import { generateParticipantCertificate } from "@/components/trainings/CertificateGenerator";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const CERTIFICATE_SCOPE_GLOBAL = "__global__";
const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i;
const CERTIFICATE_BODY_EDITOR_MODULES = {
  toolbar: "#certificate-body-toolbar",
  clipboard: {
    matchVisual: false,
  },
};
const CERTIFICATE_BODY_EDITOR_FORMATS = [
  "bold",
  "italic",
  "underline",
  "list",
  "bullet",
  "indent",
  "align",
  "link",
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const applyLegacyBoldToHtml = (value) =>
  String(value || "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

const convertLegacyBodyToHtml = (value) => {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "<p><br></p>";
  const paragraphs = normalized.split("\n\n");
  return paragraphs
    .map((paragraph) => {
      const encoded = paragraph
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br/>");
      const withBold = applyLegacyBoldToHtml(encoded);
      return `<p>${withBold || "<br/>"}</p>`;
    })
    .join("");
};

const normalizeBodyToEditorHtml = (value) => {
  const text = String(value ?? "");
  if (!text.trim()) return "<p><br></p>";
  if (HTML_TAG_REGEX.test(text)) return text;
  return convertLegacyBodyToHtml(text);
};

const buildPreviewBodyHtml = (value, paragraphSpacingMm = 0) => {
  const html = normalizeBodyToEditorHtml(value);
  if (typeof DOMParser === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild || doc.body;
  const paragraphs = Array.from(root.querySelectorAll("p"));
  paragraphs.forEach((paragraph, index) => {
    paragraph.style.margin = "0";
    if (index > 0 && paragraphSpacingMm > 0) {
      paragraph.style.marginTop = `${paragraphSpacingMm}mm`;
    }
  });
  return root.innerHTML;
};

export default function Settings() {
  const [selectedColor, setSelectedColor] = useState("blue");
  const [mappingStatus, setMappingStatus] = useState(null);
  const [orphanCleanupStatus, setOrphanCleanupStatus] = useState(null);
  const [isRunningOrphanCleanup, setIsRunningOrphanCleanup] = useState(false);
  const [certificateTemplate, setCertificateTemplate] = useState(
    DEFAULT_CERTIFICATE_TEMPLATE
  );
  const [certificateScope, setCertificateScope] = useState(
    CERTIFICATE_SCOPE_GLOBAL
  );
  const [certificateStatus, setCertificateStatus] = useState(null);
  const [emailSettings, setEmailSettings] = useState({
    fromEmail: "",
    fromName: "",
    webhookUrl: "",
  });
  const [emailStatus, setEmailStatus] = useState(null);
  const [certificateEmailTemplate, setCertificateEmailTemplate] = useState(
    DEFAULT_CERTIFICATE_EMAIL_TEMPLATE
  );
  const [emailTemplateStatus, setEmailTemplateStatus] = useState(null);
  const [lockLogoRatio, setLockLogoRatio] = useState(false);
  const [showLogoGrid, setShowLogoGrid] = useState(false);
  const [editLayer, setEditLayer] = useState("logos");
  const [isCertificateEditorOpen, setIsCertificateEditorOpen] = useState(true);
  const [isCertificatePreviewOpen, setIsCertificatePreviewOpen] = useState(true);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { gveMapping, isLoading: isGveMappingLoading } = useGveMapping();
  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  useEffect(() => {
    const savedColor = localStorage.getItem("theme-color") || "blue";
    setSelectedColor(savedColor);
    applyColor(savedColor);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("emailSettings");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      setEmailSettings({
        fromEmail: parsed.fromEmail || "",
        fromName: parsed.fromName || "",
        webhookUrl: parsed.webhookUrl || "",
      });
    } catch (error) {
      // Ignora erro de leitura
    }
  }, []);

  useEffect(() => {
    const template = loadCertificateEmailTemplate();
    setCertificateEmailTemplate(template);
  }, []);

  const colors = [
    { name: "Azul", value: "blue", classes: "bg-blue-900 border-blue-800 bg-blue-500 text-blue-100 hover:bg-blue-800 bg-blue-600 hover:bg-blue-700" },
    { name: "Verde", value: "green", classes: "bg-green-900 border-green-800 bg-green-500 text-green-100 hover:bg-green-800 bg-green-600 hover:bg-green-700" },
    { name: "Roxo", value: "purple", classes: "bg-purple-900 border-purple-800 bg-purple-500 text-purple-100 hover:bg-purple-800 bg-purple-600 hover:bg-purple-700" },
    { name: "Laranja", value: "orange", classes: "bg-orange-900 border-orange-800 bg-orange-500 text-orange-100 hover:bg-orange-800 bg-orange-600 hover:bg-orange-700" },
    { name: "Rosa", value: "pink", classes: "bg-pink-900 border-pink-800 bg-pink-500 text-pink-100 hover:bg-pink-800 bg-pink-600 hover:bg-pink-700" },
    { name: "Ciano", value: "cyan", classes: "bg-cyan-900 border-cyan-800 bg-cyan-500 text-cyan-100 hover:bg-cyan-800 bg-cyan-600 hover:bg-cyan-700" },
  ];

  const normalizeTemplateTitleKey = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const certificateTrainingOptions = useMemo(() => {
    const groupedByTitle = new Map();
    (trainings || []).forEach((training) => {
      const id = String(training?.id || "").trim();
      if (!id) return;
      const title = String(training?.title || "").trim() || "Treinamento sem título";
      const titleKey = normalizeTemplateTitleKey(title) || id;
      const existing = groupedByTitle.get(titleKey);
      if (existing) {
        if (!existing.trainingIds.includes(id)) {
          existing.trainingIds.push(id);
        }
        return;
      }
      groupedByTitle.set(titleKey, {
        id,
        title,
        date: training?.date || "",
        trainingIds: [id],
      });
    });

    return Array.from(groupedByTitle.values()).sort((a, b) =>
      a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" })
    );
  }, [trainings]);

  const selectedCertificateTraining = useMemo(
    () =>
      certificateScope === CERTIFICATE_SCOPE_GLOBAL
        ? null
        : certificateTrainingOptions.find((item) => item.id === certificateScope) ||
          null,
    [certificateScope, certificateTrainingOptions]
  );

  useEffect(() => {
    let active = true;
    const loadTemplateByScope = async () => {
      const trainingScope =
        certificateScope === CERTIFICATE_SCOPE_GLOBAL
          ? null
          : selectedCertificateTraining
          ? {
              id: selectedCertificateTraining.id,
              trainingIds: selectedCertificateTraining.trainingIds,
            }
          : certificateScope;
      try {
        const template = await resolveCertificateTemplate(trainingScope);
        if (!active) return;
        setCertificateTemplate(template || loadCertificateTemplate());
      } catch (error) {
        if (!active) return;
        setCertificateTemplate(loadCertificateTemplate());
      }
    };
    loadTemplateByScope();
    return () => {
      active = false;
    };
  }, [certificateScope, selectedCertificateTraining]);

  const applyColor = (colorValue) => {
    // Just save to localStorage, reload will apply it via layout
  };

  const handleColorChange = (colorValue) => {
    setSelectedColor(colorValue);
    applyColor(colorValue);
    localStorage.setItem("theme-color", colorValue);
    window.location.reload();
  };

  const handleCertificateHeaderChange = (value) => {
    const lines = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setCertificateTemplate((prev) => ({
      ...prev,
      headerLines: lines,
    }));
  };

  const handleCertificateChange = (field, value) => {
    setCertificateTemplate((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTextOptionChange = (field, value) => {
    setCertificateTemplate((prev) => ({
      ...prev,
      textOptions: {
        ...(prev.textOptions || {}),
        [field]: value,
      },
    }));
  };

  const handleSignatureChange = (key, field, value) => {
    setCertificateTemplate((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const logoBasePositions = useMemo(
    () => [
      { x: 20, y: 18, w: 30, h: 30 },
      { x: 247, y: 18, w: 30, h: 30 },
      { x: 20, y: 160, w: 30, h: 30 },
      { x: 247, y: 160, w: 30, h: 30 },
    ],
    []
  );

  const getDefaultLogoPosition = (index) => {
    if (logoBasePositions[index]) return logoBasePositions[index];
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: col === 0 ? 20 : 247,
      y: 18 + row * 35,
      w: 30,
      h: 30,
    };
  };

  const logoOrder = useMemo(
    () => Object.keys(certificateTemplate.logos || {}),
    [certificateTemplate.logos]
  );

  const handleAddLogo = () => {
    const key = `logo_${Date.now()}`;
    setCertificateTemplate((prev) => {
      const nextLogos = { ...(prev.logos || {}), [key]: "" };
      const nextPositions = {
        ...(prev.logoPositions || {}),
        [key]: getDefaultLogoPosition(Object.keys(nextLogos).length - 1),
      };
      return {
        ...prev,
        logos: nextLogos,
        logoPositions: nextPositions,
      };
    });
  };

  const handleRemoveLogo = (key) => {
    setCertificateTemplate((prev) => {
      const nextLogos = { ...(prev.logos || {}) };
      const nextPositions = { ...(prev.logoPositions || {}) };
      delete nextLogos[key];
      delete nextPositions[key];
      return {
        ...prev,
        logos: nextLogos,
        logoPositions: nextPositions,
      };
    });
  };

  const handleLogoUpload = (key, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCertificateTemplate((prev) => {
        const nextLogos = { ...(prev.logos || {}), [key]: dataUrl };
        const nextPositions = { ...(prev.logoPositions || {}) };
        if (!nextPositions[key]) {
          nextPositions[key] = getDefaultLogoPosition(
            Object.keys(nextLogos).indexOf(key)
          );
        }
        return {
          ...prev,
          logos: nextLogos,
          logoPositions: nextPositions,
        };
      });
    };
    reader.readAsDataURL(file);
  };
  const fontOptions = [
    { value: "helvetica", label: "Helvetica" },
    { value: "times", label: "Times" },
    { value: "courier", label: "Courier" },
  ];
  const previewFontFamily = {
    helvetica: "Helvetica, Arial, sans-serif",
    times: "\"Times New Roman\", Times, serif",
    courier: "\"Courier New\", Courier, monospace",
  };

  const defaultTextPositions = useMemo(
    () => ({
      title: { x: 148.5, y: 40, width: 257 },
      body: { x: 148.5, y: 62, width: 257 },
      footer: { x: 148.5, y: 155, width: 257 },
    }),
    []
  );
  const defaultSignaturePositions = useMemo(
    () => ({
      signature1: { x: 70, y: 170, lineWidth: 60 },
      signature2: { x: 227, y: 170, lineWidth: 60 },
    }),
    []
  );

  const previewRef = useRef(null);
  const dragStateRef = useRef(null);
  const MIN_LOGO_SIZE = 5;

  const getLogoPosition = (key) => {
    const index = Math.max(logoOrder.indexOf(key), 0);
    const base = getDefaultLogoPosition(index);
    const stored = certificateTemplate.logoPositions?.[key] || {};
    return {
      x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
      y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
      w: Number.isFinite(Number(stored.w)) ? Number(stored.w) : base.w,
      h: Number.isFinite(Number(stored.h)) ? Number(stored.h) : base.h,
    };
  };

  const getTextPosition = (key) => {
    const base = defaultTextPositions[key] || { x: 148.5, y: 40, width: 257 };
    const stored = certificateTemplate.textPositions?.[key] || {};
    return {
      x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
      y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
      width: Number.isFinite(Number(stored.width)) ? Number(stored.width) : base.width,
    };
  };

  const getSignaturePosition = (key) => {
    const base = defaultSignaturePositions[key] || { x: 70, y: 170, lineWidth: 60 };
    const stored = certificateTemplate.signaturePositions?.[key] || {};
    return {
      x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
      y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
      lineWidth: Number.isFinite(Number(stored.lineWidth))
        ? Number(stored.lineWidth)
        : base.lineWidth,
    };
  };

  const clampLogoPosition = (pos) => {
    let w = Math.max(MIN_LOGO_SIZE, Number(pos.w) || 0);
    let h = Math.max(MIN_LOGO_SIZE, Number(pos.h) || 0);
    let x = Number(pos.x) || 0;
    let y = Number(pos.y) || 0;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > previewPage.width - MIN_LOGO_SIZE) x = previewPage.width - MIN_LOGO_SIZE;
    if (y > previewPage.height - MIN_LOGO_SIZE) y = previewPage.height - MIN_LOGO_SIZE;

    if (x + w > previewPage.width) {
      w = Math.max(MIN_LOGO_SIZE, previewPage.width - x);
    }
    if (y + h > previewPage.height) {
      h = Math.max(MIN_LOGO_SIZE, previewPage.height - y);
    }

    return { x, y, w, h };
  };

  const clampTextPosition = (pos) => {
    let x = Number(pos.x) || 0;
    let y = Number(pos.y) || 0;
    let width = Number(pos.width) || defaultTextPositions.body.width;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > previewPage.width) x = previewPage.width;
    if (y > previewPage.height) y = previewPage.height;
    if (width < 20) width = 20;
    if (width > previewPage.width) width = previewPage.width;
    return { x, y, width };
  };

  const clampSignaturePosition = (pos) => {
    let x = Number(pos.x) || 0;
    let y = Number(pos.y) || 0;
    let lineWidth = Number(pos.lineWidth) || 60;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > previewPage.width) x = previewPage.width;
    if (y > previewPage.height) y = previewPage.height;
    if (lineWidth < 20) lineWidth = 20;
    if (lineWidth > previewPage.width) lineWidth = previewPage.width;
    return { x, y, lineWidth };
  };

  const updateLogoPosition = (key, next) => {
    const clamped = clampLogoPosition(next);
    setCertificateTemplate((prev) => ({
      ...prev,
      logoPositions: {
        ...(prev.logoPositions || {}),
        [key]: clamped,
      },
    }));
  };

  const updateTextPosition = (key, next) => {
    const clamped = clampTextPosition(next);
    setCertificateTemplate((prev) => ({
      ...prev,
      textPositions: {
        ...defaultTextPositions,
        ...(prev.textPositions || {}),
        [key]: clamped,
      },
    }));
  };

  const updateSignaturePosition = (key, next) => {
    const clamped = clampSignaturePosition(next);
    setCertificateTemplate((prev) => ({
      ...prev,
      signaturePositions: {
        ...defaultSignaturePositions,
        ...(prev.signaturePositions || {}),
        [key]: clamped,
      },
    }));
  };

  const handleLogoPositionChange = (key, field, value) => {
    const numeric = Number(value);
    const current = getLogoPosition(key);
    updateLogoPosition(key, {
      ...current,
      [field]: Number.isFinite(numeric) ? numeric : 0,
    });
  };

  const handleFontChange = (field, value) => {
    setCertificateTemplate((prev) => ({
      ...prev,
      fonts: {
        ...(prev.fonts || {}),
        [field]: value,
      },
    }));
  };

  const handleFontNumberChange = (field, value) => {
    const numeric = Number(value);
    setCertificateTemplate((prev) => ({
      ...prev,
      fonts: {
        ...(prev.fonts || {}),
        [field]: Number.isFinite(numeric) ? numeric : 0,
      },
    }));
  };

  const getRelativeMm = (event) => {
    if (!previewRef.current) return null;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * previewPage.width;
    const y = ((event.clientY - rect.top) / rect.height) * previewPage.height;
    return {
      x: Math.max(0, Math.min(previewPage.width, x)),
      y: Math.max(0, Math.min(previewPage.height, y)),
    };
  };

  const startMoveLogo = (event, key) => {
    if (event.button !== 0) return;
    const startPoint = getRelativeMm(event);
    if (!startPoint) return;
    event.preventDefault();
    const startPos = getLogoPosition(key);
    dragStateRef.current = { key, mode: "move", startPoint, startPos };

    const handleMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      const point = getRelativeMm(moveEvent);
      if (!point) return;
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      updateLogoPosition(key, {
        ...startPos,
        x: startPos.x + dx,
        y: startPos.y + dy,
      });
    };

    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const startResizeLogo = (event, key, handle) => {
    if (event.button !== 0) return;
    const startPoint = getRelativeMm(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    const startPos = getLogoPosition(key);
    dragStateRef.current = {
      key,
      mode: "resize",
      handle,
      startPoint,
      startPos,
    };

    const handleMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      const point = getRelativeMm(moveEvent);
      if (!point) return;
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      let { x, y, w, h } = startPos;

      if (handle.includes("e")) w = startPos.w + dx;
      if (handle.includes("s")) h = startPos.h + dy;
      if (handle.includes("w")) {
        x = startPos.x + dx;
        w = startPos.w - dx;
      }
      if (handle.includes("n")) {
        y = startPos.y + dy;
        h = startPos.h - dy;
      }

      if (lockLogoRatio) {
        const ratio = startPos.w / Math.max(startPos.h, 0.0001);
        const isCorner = handle.length === 2;
        const preferWidth = Math.abs(dx) >= Math.abs(dy);

        if (isCorner) {
          if (preferWidth) {
            h = w / ratio;
          } else {
            w = h * ratio;
          }
          if (handle.includes("w")) {
            x = startPos.x + (startPos.w - w);
          }
          if (handle.includes("n")) {
            y = startPos.y + (startPos.h - h);
          }
        } else if (handle.includes("e") || handle.includes("w")) {
          h = w / ratio;
          if (handle.includes("n")) {
            y = startPos.y + (startPos.h - h);
          }
        } else if (handle.includes("n") || handle.includes("s")) {
          w = h * ratio;
          if (handle.includes("w")) {
            x = startPos.x + (startPos.w - w);
          }
        }
      }

      if (w < MIN_LOGO_SIZE) {
        if (handle.includes("w")) {
          x = startPos.x + (startPos.w - MIN_LOGO_SIZE);
        }
        w = MIN_LOGO_SIZE;
      }
      if (h < MIN_LOGO_SIZE) {
        if (handle.includes("n")) {
          y = startPos.y + (startPos.h - MIN_LOGO_SIZE);
        }
        h = MIN_LOGO_SIZE;
      }

      updateLogoPosition(key, { x, y, w, h });
    };

    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const startMoveText = (event, key) => {
    if (event.button !== 0) return;
    const startPoint = getRelativeMm(event);
    if (!startPoint) return;
    event.preventDefault();
    const startPos = getTextPosition(key);
    dragStateRef.current = { key, mode: "move-text", startPoint, startPos };

    const handleMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      const point = getRelativeMm(moveEvent);
      if (!point) return;
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      updateTextPosition(key, {
        ...startPos,
        x: startPos.x + dx,
        y: startPos.y + dy,
      });
    };

    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const startMoveSignature = (event, key) => {
    if (event.button !== 0) return;
    const startPoint = getRelativeMm(event);
    if (!startPoint) return;
    event.preventDefault();
    const startPos = getSignaturePosition(key);
    dragStateRef.current = { key, mode: "move-signature", startPoint, startPos };

    const handleMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      const point = getRelativeMm(moveEvent);
      if (!point) return;
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      updateSignaturePosition(key, {
        ...startPos,
        x: startPos.x + dx,
        y: startPos.y + dy,
      });
    };

    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const getCertificateSyncErrorText = (error) =>
    String(
      error?.message ||
        error?.error_description ||
        error?.details ||
        error?.hint ||
        ""
    ).trim();

  const isCertificateSyncPermissionError = (error) => {
    const message = getCertificateSyncErrorText(error).toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return (
      message.includes("row-level security") ||
      message.includes("violates row-level security policy") ||
      message.includes("permission denied") ||
      message.includes("not authorized") ||
      message.includes("unauthorized") ||
      code === "42501"
    );
  };

  const buildCertificateSyncWarningMessage = (baseMessage) =>
    `${baseMessage} A sincronização online está indisponível para este perfil neste navegador.`;

  const handleSaveCertificate = async () => {
    const payload = {
      ...certificateTemplate,
      updatedAt: new Date().toISOString(),
    };
    setCertificateTemplate(payload);
    const scopedTrainingId =
      certificateScope === CERTIFICATE_SCOPE_GLOBAL ? "" : certificateScope;
    const scopeLabel = selectedCertificateTraining?.title || "treinamento selecionado";
    const scopedTrainingIds =
      selectedCertificateTraining?.trainingIds?.filter(Boolean) || [];
    const scopedTrainingScope = scopedTrainingIds.length
      ? { id: scopedTrainingId, trainingIds: scopedTrainingIds }
      : scopedTrainingId;
    const groupedScopeSuffix =
      scopedTrainingIds.length > 1
        ? ` (aplicado a ${scopedTrainingIds.length} turmas com o mesmo nome)`
        : "";

    if (scopedTrainingId) {
      try {
        await saveCertificateTemplateForTraining(scopedTrainingScope, payload);
        const cloudSyncDisabled = isCertificateTemplateCloudSyncDisabled();
        setCertificateStatus({
          type: cloudSyncDisabled ? "warning" : "success",
          message: cloudSyncDisabled
            ? buildCertificateSyncWarningMessage(
                `Modelo de certificado salvo para "${scopeLabel}"${groupedScopeSuffix}.`
              )
            : `Modelo de certificado salvo para "${scopeLabel}"${groupedScopeSuffix}.`,
        });
      } catch (error) {
        const syncErrorText = getCertificateSyncErrorText(error);
        if (isCertificateSyncPermissionError(error)) {
          setCertificateStatus({
            type: "warning",
            message: buildCertificateSyncWarningMessage(
              `Modelo de certificado salvo para "${scopeLabel}"${groupedScopeSuffix} neste navegador.`
            ),
          });
          return;
        }
        setCertificateStatus({
          type: "error",
          message:
            syncErrorText ||
            `Modelo salvo localmente para "${scopeLabel}"${groupedScopeSuffix}, mas falhou ao sincronizar no Supabase.`,
        });
      }
      return;
    }

    saveCertificateTemplate(payload);
    try {
      const synced = await saveCertificateTemplateToStorage(payload);
      setCertificateStatus({
        type: synced ? "success" : "warning",
        message: synced
          ? "Modelo padrão de certificado salvo com sucesso."
          : buildCertificateSyncWarningMessage(
              "Modelo padrão de certificado salvo neste navegador."
            ),
      });
    } catch (error) {
      const syncErrorText = getCertificateSyncErrorText(error);
      if (isCertificateSyncPermissionError(error)) {
        setCertificateStatus({
          type: "warning",
          message: buildCertificateSyncWarningMessage(
            "Modelo padrão salvo neste navegador."
          ),
        });
        return;
      }
      setCertificateStatus({
        type: "error",
        message:
          syncErrorText ||
          "Modelo padrão salvo localmente, mas falhou ao sincronizar no Supabase.",
      });
    }
  };

  const handleResetCertificate = async () => {
    const scopedTrainingId =
      certificateScope === CERTIFICATE_SCOPE_GLOBAL ? "" : certificateScope;
    const scopeLabel = selectedCertificateTraining?.title || "treinamento selecionado";
    const scopedTrainingIds =
      selectedCertificateTraining?.trainingIds?.filter(Boolean) || [];
    const scopedTrainingScope = scopedTrainingIds.length
      ? { id: scopedTrainingId, trainingIds: scopedTrainingIds }
      : scopedTrainingId;
    const groupedScopeSuffix =
      scopedTrainingIds.length > 1
        ? ` (${scopedTrainingIds.length} turmas com o mesmo nome)`
        : "";

    if (scopedTrainingId) {
      try {
        const fallback = await resetCertificateTemplateForTraining(
          scopedTrainingScope
        );
        setCertificateTemplate(fallback);
        const cloudSyncDisabled = isCertificateTemplateCloudSyncDisabled();
        setCertificateStatus({
          type: cloudSyncDisabled ? "warning" : "success",
          message: cloudSyncDisabled
            ? buildCertificateSyncWarningMessage(
                `Modelo específico removido para "${scopeLabel}"${groupedScopeSuffix}. Agora será usado o modelo padrão.`
              )
            : `Modelo específico removido para "${scopeLabel}"${groupedScopeSuffix}. Agora será usado o modelo padrão.`,
        });
      } catch (error) {
        const syncErrorText = getCertificateSyncErrorText(error);
        if (isCertificateSyncPermissionError(error)) {
          setCertificateStatus({
            type: "warning",
            message: buildCertificateSyncWarningMessage(
              `Modelo local removido para "${scopeLabel}"${groupedScopeSuffix}.`
            ),
          });
          return;
        }
        setCertificateStatus({
          type: "error",
          message:
            syncErrorText ||
            `Modelo local removido para "${scopeLabel}"${groupedScopeSuffix}, mas falhou ao sincronizar no Supabase.`,
        });
      }
      return;
    }

    const reset = {
      ...resetCertificateTemplate(),
      updatedAt: new Date().toISOString(),
    };
    setCertificateTemplate(reset);
    try {
      const synced = await saveCertificateTemplateToStorage(reset);
      setCertificateStatus({
        type: synced ? "success" : "warning",
        message: synced
          ? "Modelo padrão restaurado."
          : buildCertificateSyncWarningMessage(
              "Modelo padrão restaurado neste navegador."
            ),
      });
    } catch (error) {
      const syncErrorText = getCertificateSyncErrorText(error);
      if (isCertificateSyncPermissionError(error)) {
        setCertificateStatus({
          type: "warning",
          message: buildCertificateSyncWarningMessage(
            "Modelo padrão restaurado neste navegador."
          ),
        });
        return;
      }
      setCertificateStatus({
        type: "error",
        message:
          syncErrorText ||
          "Modelo padrão restaurado localmente, mas falhou ao sincronizar no Supabase.",
      });
    }
  };

  const normalizeRgValue = (value) =>
    String(value || "")
      .replace(/^rg\s*/i, "")
      .trim();

  const handlePreviewPdf = () => {
    const previewScore = Number(String(previewData.nota || "").replace(",", "."));
    const previewKappa = Number(String(previewData.kappa || "").replace(",", "."));
    const participant = {
      professional_name: previewData.nome,
      professional_rg: normalizeRgValue(previewData.rg),
      professional_email: "exemplo@email.com",
      certificate_score: Number.isFinite(previewScore) ? previewScore : null,
      certificate_kappa: Number.isFinite(previewKappa) ? previewKappa : null,
    };
    const training = {
      title: previewData.treinamento,
      dates: [{ date: new Date() }],
      duration_hours: Number(previewData.carga_horaria) || 0,
      coordinator: previewData.coordenador,
      instructor: previewData.instrutor,
    };
    const pdf = generateParticipantCertificate(participant, training, certificateTemplate);
    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  };

  const handleEmailSettingChange = (field, value) => {
    setEmailSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEmailTemplateChange = (field, value) => {
    setCertificateEmailTemplate((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveEmailTemplate = () => {
    saveCertificateEmailTemplate(certificateEmailTemplate);
    setEmailTemplateStatus({
      type: "success",
      message: "Mensagem de e-mail salva com sucesso.",
    });
  };

  const handleResetEmailTemplate = () => {
    const reset = resetCertificateEmailTemplate();
    setCertificateEmailTemplate(reset);
    setEmailTemplateStatus({
      type: "success",
      message: "Mensagem padrão restaurada.",
    });
  };

  const handleSaveEmailSettings = () => {
    const payload = {
      fromEmail: String(emailSettings.fromEmail || "").trim(),
      fromName: String(emailSettings.fromName || "").trim(),
      webhookUrl: String(emailSettings.webhookUrl || "").trim(),
    };
    localStorage.setItem("emailSettings", JSON.stringify(payload));
    setEmailStatus({
      type: "success",
      message: "Configurações de e-mail salvas.",
    });
  };

  const handleClearEmailSettings = () => {
    localStorage.removeItem("emailSettings");
    setEmailSettings({ fromEmail: "", fromName: "", webhookUrl: "" });
    setEmailStatus({
      type: "success",
      message: "Configurações de e-mail removidas.",
    });
  };

  const interpolateText = (text, data) =>
    String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
      data[key] !== undefined && data[key] !== null ? String(data[key]) : ""
    );

  const previewData = {
    nome: "Nome do Participante",
    rg: "RG 00.000.000-0",
    treinamento: "Treinamento de Exemplo",
    carga_horaria: "8",
    data: format(new Date(), "dd/MM/yyyy"),
    entidade: certificateTemplate.entityName || "Entidade",
    coordenador: "Coordenador(a) Responsável",
    instrutor: "Instrutor(a) Responsável",
    funcao: "participante",
    tipo_certificado: "participante",
    aula: "Aula de Exemplo",
    periodo_treinamento: "de 10/02/2026 a 12/02/2026",
    dias_treinamento: "10/02/2026, 11/02/2026, 12/02/2026",
    nota: "82,0",
    nota_percentual: "82,0%",
    kappa: "0,820",
    nota_texto: "Nota final (Kappa x100): 82,0%",
  };

  const emailPreviewData = buildCertificateEmailData({
    training: {
      title: previewData.treinamento,
      dates: [{ date: new Date() }],
      duration_hours: Number(previewData.carga_horaria) || 0,
      coordinator: previewData.coordenador,
      instructor: previewData.instrutor,
    },
    nome: previewData.nome,
    rg: normalizeRgValue(previewData.rg),
    role: "participant",
  });

  const previewEmailSubject = interpolateEmailTemplate(
    certificateEmailTemplate.subject,
    emailPreviewData
  );
  const previewEmailBody = interpolateEmailTemplate(
    certificateEmailTemplate.body,
    emailPreviewData
  );

  const resolveSignature = (signature) => {
    if (!signature || signature.source === "none") return null;
    if (signature.source === "custom") {
      const name = signature.name?.trim();
      const role = signature.role?.trim();
      if (!name && !role) return null;
      return { name, role };
    }
    if (signature.source === "coordinator") {
      return {
        name: previewData.coordenador,
        role: signature.role || "Coordenador",
      };
    }
    if (signature.source === "instructor") {
      return {
        name: previewData.instrutor,
        role: signature.role || "Instrutor",
      };
    }
    return null;
  };

  const previewHeaderLines = certificateTemplate.headerLines || [];
  const previewTitle = interpolateText(
    certificateTemplate.title || "CERTIFICADO",
    previewData
  );
  const bodyParagraphSpacingValue =
    Number(certificateTemplate.textOptions?.bodyParagraphSpacing) || 0;
  const editorBodyValue = normalizeBodyToEditorHtml(certificateTemplate.body || "");
  const previewBodyHtml = buildPreviewBodyHtml(
    interpolateText(certificateTemplate.body || "", previewData),
    bodyParagraphSpacingValue
  );
  const previewFooter = certificateTemplate.footer
    ? interpolateText(certificateTemplate.footer, previewData)
    : "";
  const signature1 = resolveSignature(certificateTemplate.signature1);
  const signature2 = resolveSignature(certificateTemplate.signature2);
  const fontFamilyValue = certificateTemplate.fonts?.family || "helvetica";
  const previewFont = previewFontFamily[fontFamilyValue] || previewFontFamily.helvetica;
  const isBodyJustified = certificateTemplate.textOptions?.bodyJustify !== false;
  const bodyLineHeightValue = Number(certificateTemplate.textOptions?.bodyLineHeight) || 1.2;
  const bodyMaxWordSpacingValue =
    Number(certificateTemplate.textOptions?.bodyMaxWordSpacing) || 3;
  const bodyIndentValue = Number(certificateTemplate.textOptions?.bodyIndent) || 0;
  const bodyFontSizeValue = Number(certificateTemplate.fonts?.bodySize) || 14;

  const previewPage = { width: 297, height: 210 };
  const bodyIndentPercent = (bodyIndentValue / previewPage.width) * 100;
  const toPercent = (value, total) => `${(value / total) * 100}%`;

  const logoPreviewItems = useMemo(
    () =>
      logoOrder.map((key, index) => {
        const position = getLogoPosition(key);
        return {
          key,
          label: `Logo ${index + 1}`,
          position,
          dataUrl: certificateTemplate.logos?.[key] || "",
        };
      }),
    [certificateTemplate.logos, certificateTemplate.logoPositions, logoOrder]
  );

  const normalizeHeader = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const normalizeRow = (row) =>
    Object.entries(row || {}).reduce((acc, [key, value]) => {
      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) return acc;
      acc[normalizedKey] = value;
      return acc;
    }, {});

  const parseCsv = (text) =>
    new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: "",
        delimitersToGuess: [",", ";", "\t", "|"],
        complete: (result) => resolve(result.data || []),
        error: (error) => reject(error),
      });
    });

  const parseXlsx = async (buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  };

  const buildGveMapping = (rows) => {
    const mapped = [];
    rows.forEach((rawRow) => {
      const row = normalizeRow(rawRow);
      const municipio =
        row.municipio ||
        row.municipio_nome ||
        row.cidade ||
        row.nome_municipio ||
        row.municipio_de_residencia;
      const gve =
        row.gve ||
        row.gve_nome ||
        row.gve_name ||
        row.regional ||
        row.regional_saude ||
        row.gvs ||
        row.regional_de_saude;
      if (!municipio || !gve) return;
      mapped.push({
        municipio: String(municipio).trim(),
        gve: String(gve).trim(),
      });
    });
    return normalizeGveMappingRows(mapped);
  };

  const getReadableErrorMessage = (error, fallback) => {
    if (!error) return fallback;
    if (typeof error === "string" && error.trim()) return error;
    const parts = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code ? `Código: ${error.code}` : "",
    ].filter(Boolean);
    if (parts.length) return parts.join(" | ");
    return fallback;
  };

  const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

  const normalizeDateKey = (value) => {
    if (!value) return "";
    const text = String(value).trim();
    if (!text) return "";
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getTrainingDateKeys = (training) => {
    if (!training) return [];
    const keys = [];
    const baseDate = normalizeDateKey(training.date);
    if (baseDate) keys.push(baseDate);

    const trainingDates = Array.isArray(training.dates) ? training.dates : [];
    trainingDates.forEach((item) => {
      const value = typeof item === "object" ? item?.date : item;
      const dateKey = normalizeDateKey(value);
      if (dateKey) keys.push(dateKey);
    });

    return Array.from(new Set(keys));
  };

  const buildTrainingLookups = (trainings) => {
    const byId = new Map();
    const byTitle = new Map();
    (trainings || []).forEach((training) => {
      const trainingId = String(training?.id || "").trim();
      if (trainingId) byId.set(trainingId, training);

      const titleKey = normalizeText(training?.title);
      if (!titleKey) return;
      if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
      byTitle.get(titleKey).push(training);
    });
    return { byId, byTitle };
  };

  const hasLinkedTraining = (participant, lookups) => {
    if (!participant) return false;
    const trainingId = String(participant.training_id || "").trim();
    if (trainingId) return lookups.byId.has(trainingId);

    const titleKey = normalizeText(participant.training_title);
    if (!titleKey) return false;
    const candidates = lookups.byTitle.get(titleKey) || [];
    if (!candidates.length) return false;

    const participantDateKey = normalizeDateKey(participant.training_date);
    if (!participantDateKey) return true;
    return candidates.some((training) =>
      getTrainingDateKeys(training).includes(participantDateKey)
    );
  };

  const handleRunOrphanCleanup = async () => {
    if (isRunningOrphanCleanup) return;
    setIsRunningOrphanCleanup(true);
    setOrphanCleanupStatus({
      type: "loading",
      message: "Executando limpeza de órfãos...",
    });

    try {
      const [trainings, participants] = await Promise.all([
        dataClient.entities.Training.list(),
        dataClient.entities.TrainingParticipant.list(),
      ]);

      const lookups = buildTrainingLookups(trainings);
      const orphanRows = (participants || []).filter(
        (participant) => !hasLinkedTraining(participant, lookups)
      );

      if (!orphanRows.length) {
        setOrphanCleanupStatus({
          type: "success",
          message: "Nenhum registro órfão encontrado.",
        });
        return;
      }

      const orphanIds = orphanRows
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean);
      const missingIdCount = orphanRows.length - orphanIds.length;

      if (!orphanIds.length) {
        setOrphanCleanupStatus({
          type: "error",
          message:
            "Foram encontrados órfãos, mas sem ID válido para exclusão automática.",
        });
        return;
      }

      const results = await Promise.allSettled(
        orphanIds.map((id) => dataClient.entities.TrainingParticipant.delete(id))
      );
      const deletedCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const failedCount = results.length - deletedCount;

      if (deletedCount > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["participants"] }),
          queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] }),
          queryClient.invalidateQueries({ queryKey: ["training"] }),
          queryClient.invalidateQueries({ queryKey: ["trainings"] }),
        ]);
      }

      const details = [];
      if (deletedCount > 0) details.push(`${deletedCount} removido(s)`);
      if (failedCount > 0) details.push(`${failedCount} com falha`);
      if (missingIdCount > 0) details.push(`${missingIdCount} sem ID`);

      setOrphanCleanupStatus({
        type: failedCount > 0 || missingIdCount > 0 ? "error" : "success",
        message: `Limpeza concluída: ${details.join(", ")}.`,
      });
    } catch (error) {
      setOrphanCleanupStatus({
        type: "error",
        message: getReadableErrorMessage(
          error,
          "Erro ao executar limpeza de órfãos."
        ),
      });
    } finally {
      setIsRunningOrphanCleanup(false);
    }
  };

  const handleMappingFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMappingStatus({ type: "loading", message: "Lendo e salvando planilha..." });
    try {
      const lowerName = file.name.toLowerCase();
      let rows = [];
      if (lowerName.endsWith(".csv")) {
        const text = await file.text();
        rows = await parseCsv(text);
      } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        rows = await parseXlsx(buffer);
      } else {
        throw new Error("Formato inválido. Use CSV ou XLSX.");
      }
      const mapping = buildGveMapping(rows || []);
      if (mapping.length === 0) {
        throw new Error("Nenhum município/GVE encontrado na planilha.");
      }
      const savedMapping =
        await dataClient.integrations.Core.ReplaceMunicipalityGveMapping({
          mapping,
        });
      queryClient.setQueryData(["gve-mapping"], savedMapping);
      setMappingStatus({
        type: "success",
        message: `${savedMapping.length} municípios carregados.`,
      });
    } catch (error) {
      setMappingStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Erro ao importar planilha."),
      });
    }
  };

  const handleClearMapping = async () => {
    try {
      await dataClient.integrations.Core.ClearMunicipalityGveMapping();
      queryClient.setQueryData(["gve-mapping"], []);
      setMappingStatus({
        type: "success",
        message: "Planilha removida.",
      });
    } catch (error) {
      setMappingStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Erro ao remover planilha."),
      });
    }
  };

  const handleExportMapping = () => {
    if (!gveMapping.length) return;
    const header = ["municipio", "gve"];
    const escapeValue = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.map(escapeValue).join(";"),
      ...gveMapping.map((item) =>
        [item.municipio, item.gve].map(escapeValue).join(";")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "municipios_gve_sp.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        subtitle="Personalize o sistema"
      />

      <Tabs defaultValue="tema" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-2 lg:grid-cols-6">
          <TabsTrigger value="tema" className="gap-2">
            <Palette className="h-4 w-4" />
            Tema
          </TabsTrigger>
          <TabsTrigger value="planilhas" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Planilhas
          </TabsTrigger>
          <TabsTrigger value="certificados" className="gap-2">
            <FileText className="h-4 w-4" />
            Certificados
          </TabsTrigger>
          <TabsTrigger value="exportacao" className="gap-2">
            <Database className="h-4 w-4" />
            Exportações
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="sobre" className="gap-2">
            <Info className="h-4 w-4" />
            Sobre
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tema" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-blue-600" />
                Tema de Cores
              </CardTitle>
              <CardDescription>
                Escolha a cor principal do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => handleColorChange(color.value)}
                    className={`relative p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                      selectedColor === color.value
                        ? "border-slate-900 shadow-lg"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`h-16 w-full rounded-md mb-2 bg-${color.value}-600`}
                    />
                    <p className="text-sm font-medium text-center">{color.name}</p>
                    {selectedColor === color.value && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white flex items-center justify-center">
                        <Check className="h-4 w-4 text-green-600" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="planilhas" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                Municípios x GVE (SP)
              </CardTitle>
              <CardDescription>
                Faça upload da planilha para usar em estoque, treinamentos e viagens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Colunas aceitas: MUNICIPIO (ou CIDADE) e GVE / GVE_NOME.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="gve-upload">Importar planilha (CSV ou XLSX)</Label>
                <Input
                  id="gve-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleMappingFile}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportMapping}
                  disabled={!gveMapping.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar planilha
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearMapping}
                  disabled={!gveMapping.length}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover planilha
                </Button>
              </div>
              <div className="text-sm text-slate-600">
                {isGveMappingLoading
                  ? "Carregando planilha salva..."
                  : gveMapping.length > 0
                  ? `${gveMapping.length} municípios carregados.`
                  : "Nenhuma planilha carregada."}
              </div>
              {mappingStatus && (
                <Alert
                  className={
                    mappingStatus.type === "error"
                      ? "border-red-200 bg-red-50"
                      : mappingStatus.type === "success"
                      ? "border-green-200 bg-green-50"
                      : "border-blue-200 bg-blue-50"
                  }
                >
                  <AlertDescription
                    className={
                      mappingStatus.type === "error"
                        ? "text-red-800"
                        : mappingStatus.type === "success"
                        ? "text-green-800"
                        : "text-blue-800"
                    }
                  >
                    {mappingStatus.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="mt-4 border-t pt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Limpeza de órfãos (inscritos)
                  </p>
                  <p className="text-xs text-slate-500">
                    Remove participantes vinculados a treinamentos que não existem mais.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRunOrphanCleanup}
                  disabled={isRunningOrphanCleanup}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${
                      isRunningOrphanCleanup ? "animate-spin" : ""
                    }`}
                  />
                  {isRunningOrphanCleanup
                    ? "Executando limpeza..."
                    : "Executar limpeza de órfãos"}
                </Button>
                {orphanCleanupStatus && (
                  <Alert
                    className={
                      orphanCleanupStatus.type === "error"
                        ? "border-red-200 bg-red-50"
                        : orphanCleanupStatus.type === "success"
                        ? "border-green-200 bg-green-50"
                        : "border-blue-200 bg-blue-50"
                    }
                  >
                    <AlertDescription
                      className={
                        orphanCleanupStatus.type === "error"
                          ? "text-red-800"
                          : orphanCleanupStatus.type === "success"
                          ? "text-green-800"
                          : "text-blue-800"
                      }
                    >
                      {orphanCleanupStatus.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificados" className="mt-6">
          <Tabs defaultValue="criar" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="criar">Criação</TabsTrigger>
              <TabsTrigger value="visualizar">Visualização</TabsTrigger>
            </TabsList>

            <TabsContent value="criar" className="mt-6">
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-blue-900">
                        <FileText className="h-5 w-5 text-blue-700" />
                        Modelo de Certificado
                      </CardTitle>
                      <CardDescription className="mt-1 text-blue-900/80">
                        Configure textos, assinaturas e logos. Você pode salvar um
                        modelo padrão geral ou um modelo específico para cada
                        treinamento.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-800 hover:bg-blue-100"
                      onClick={() =>
                        setIsCertificateEditorOpen((prev) => !prev)
                      }
                    >
                      {isCertificateEditorOpen ? "Ocultar seção" : "Mostrar seção"}
                    </Button>
                  </div>
                </CardHeader>
                {isCertificateEditorOpen && (
                <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Escopo do modelo</Label>
                  <Select
                    value={certificateScope}
                    onValueChange={(value) => {
                      setCertificateScope(value);
                      setCertificateStatus(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o escopo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CERTIFICATE_SCOPE_GLOBAL}>
                        Modelo padrão (todos os treinamentos)
                      </SelectItem>
                      {certificateTrainingOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.title}
                          {option.trainingIds?.length > 1
                            ? ` (${option.trainingIds.length} turmas)`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Treinamentos com o mesmo nome usam o mesmo modelo.
                    Selecione o nome para editar o modelo compartilhado.
                  </p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-700">Modelo em edição</p>
                  <p className="text-slate-600 mt-1">
                    {selectedCertificateTraining
                      ? `Treinamento: ${selectedCertificateTraining.title}${
                          selectedCertificateTraining.trainingIds?.length > 1
                            ? ` (${selectedCertificateTraining.trainingIds.length} turmas)`
                            : ""
                        }`
                      : "Padrão geral (aplicado a todos os treinamentos)."}
                  </p>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  Variáveis disponíveis: {"{{nome}}"}, {"{{rg}}"}, {"{{treinamento}}"},
                  {"{{carga_horaria}}"}, {"{{data}}"}, {"{{entidade}}"},
                  {"{{coordenador}}"}, {"{{instrutor}}"}, {"{{funcao}}"},
                  {"{{tipo_certificado}}"}, {"{{aula}}"}, {"{{periodo_treinamento}}"},
                  {"{{dias_treinamento}}"}, {"{{nota}}"}, {"{{nota_percentual}}"},
                  {"{{kappa}}"} e {"{{nota_texto}}"}.
                </AlertDescription>
              </Alert>

              <Accordion
                type="multiple"
                defaultValue={["textos"]}
                className="w-full"
              >
                <AccordionItem value="textos">
                  <AccordionTrigger>Textos do certificado</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Texto do cabeçalho (uma linha por item)</Label>
                      <Textarea
                        value={(certificateTemplate.headerLines || []).join("\n")}
                        onChange={(e) => handleCertificateHeaderChange(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Título</Label>
                        <Input
                          value={certificateTemplate.title}
                          onChange={(e) => handleCertificateChange("title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Entidade</Label>
                        <Input
                          value={certificateTemplate.entityName}
                          onChange={(e) => handleCertificateChange("entityName", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Texto do certificado</Label>
                        <p className="text-xs text-slate-500">
                          Editor avançado com barra de ferramentas completa.
                        </p>
                      </div>
                      <div className="rounded-md border bg-slate-50">
                        <div
                          id="certificate-body-toolbar"
                          className="flex flex-wrap items-center gap-1 border-b bg-white p-2"
                        >
                          <span className="ql-formats">
                            <button type="button" className="ql-bold" title="Negrito" />
                            <button type="button" className="ql-italic" title="Itálico" />
                            <button type="button" className="ql-underline" title="Sublinhado" />
                          </span>
                          <span className="ql-formats">
                            <button
                              type="button"
                              className="ql-list"
                              value="ordered"
                              title="Lista numerada"
                            />
                            <button
                              type="button"
                              className="ql-list"
                              value="bullet"
                              title="Lista com marcadores"
                            />
                            <button
                              type="button"
                              className="ql-indent"
                              value="-1"
                              title="Diminuir recuo"
                            />
                            <button
                              type="button"
                              className="ql-indent"
                              value="+1"
                              title="Aumentar recuo"
                            />
                          </span>
                          <span className="ql-formats">
                            <button
                              type="button"
                              className="ql-align"
                              value=""
                              title="Alinhar à esquerda"
                            />
                            <button
                              type="button"
                              className="ql-align"
                              value="center"
                              title="Centralizar"
                            />
                            <button
                              type="button"
                              className="ql-align"
                              value="right"
                              title="Alinhar à direita"
                            />
                            <button
                              type="button"
                              className="ql-align"
                              value="justify"
                              title="Justificar"
                            />
                          </span>
                          <span className="ql-formats">
                            <button type="button" className="ql-clean" title="Limpar formatação" />
                          </span>
                        </div>
                        <ReactQuill
                          theme="snow"
                          value={editorBodyValue}
                          onChange={(value) => handleCertificateChange("body", value)}
                          modules={CERTIFICATE_BODY_EDITOR_MODULES}
                          formats={CERTIFICATE_BODY_EDITOR_FORMATS}
                          className="[&_.ql-toolbar]:border-x-0 [&_.ql-toolbar]:border-t-0 [&_.ql-container]:min-h-[220px] [&_.ql-container]:border-x-0 [&_.ql-container]:border-b-0 [&_.ql-editor]:min-h-[220px] [&_.ql-editor]:text-sm"
                          placeholder="Digite o texto do certificado..."
                        />
                        <div className="flex flex-wrap items-end gap-3 border-t bg-white/80 p-3">
                          <div className="space-y-1">
                            <Label className="text-xs" title="Tamanho geral do texto no PDF">
                              Tamanho do texto
                            </Label>
                            <Input
                              type="number"
                              min="8"
                              max="32"
                              title="Define o tamanho do texto do corpo no PDF"
                              value={bodyFontSizeValue}
                              onChange={(e) =>
                                handleFontNumberChange("bodySize", e.target.value)
                              }
                              className="h-8 w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" title="Espaçamento entre linhas do texto">
                              Espaço entre linhas
                            </Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="1"
                              max="3"
                              title="Ajusta a distância entre linhas no certificado"
                              value={bodyLineHeightValue}
                              onChange={(e) =>
                                handleTextOptionChange(
                                  "bodyLineHeight",
                                  Number(e.target.value) || 1.2
                                )
                              }
                              className="h-8 w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" title="Espaço extra entre parágrafos (mm)">
                              Espaço entre parágrafos
                            </Label>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              title="Controla o espaço vertical entre parágrafos no PDF"
                              value={bodyParagraphSpacingValue}
                              onChange={(e) =>
                                handleTextOptionChange(
                                  "bodyParagraphSpacing",
                                  Math.max(0, Number(e.target.value) || 0)
                                )
                              }
                              className="h-8 w-28"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" title="Multiplicador máximo para justificar palavras">
                              Espaço entre palavras
                            </Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="1"
                              max="6"
                              title="Define o limite de expansão entre palavras ao justificar"
                              value={bodyMaxWordSpacingValue}
                              onChange={(e) =>
                                handleTextOptionChange(
                                  "bodyMaxWordSpacing",
                                  Number(e.target.value) || 3
                                )
                              }
                              className="h-8 w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs" title="Recuo da primeira linha do parágrafo (mm)">
                              Recuo do parágrafo
                            </Label>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              max="30"
                              title="Define o recuo da primeira linha de cada parágrafo"
                              value={bodyIndentValue}
                              onChange={(e) =>
                                handleTextOptionChange(
                                  "bodyIndent",
                                  Number(e.target.value) || 0
                                )
                              }
                              className="h-8 w-24"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Rodapé (cidade/data)</Label>
                      <Input
                        value={certificateTemplate.footer}
                        onChange={(e) => handleCertificateChange("footer", e.target.value)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="fontes">
                  <AccordionTrigger>Fonte e tamanhos</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fonte do certificado</Label>
                        <Select
                          value={fontFamilyValue}
                          onValueChange={(value) => handleFontChange("family", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fontOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Cabeçalho</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.headerSize || 10}
                          onChange={(e) =>
                            handleFontNumberChange("headerSize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Título</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.titleSize || 28}
                          onChange={(e) =>
                            handleFontNumberChange("titleSize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.nameSize || 24}
                          onChange={(e) =>
                            handleFontNumberChange("nameSize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Texto</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.bodySize || 14}
                          onChange={(e) =>
                            handleFontNumberChange("bodySize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rodapé</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.footerSize || 12}
                          onChange={(e) =>
                            handleFontNumberChange("footerSize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Assinatura</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.signatureSize || 11}
                          onChange={(e) =>
                            handleFontNumberChange("signatureSize", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cargo</Label>
                        <Input
                          type="number"
                          value={certificateTemplate.fonts?.signatureRoleSize || 9}
                          onChange={(e) =>
                            handleFontNumberChange("signatureRoleSize", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Os ajustes do texto corrido (justificar/parágrafo/espaçamento) ficam
                      na barra exclusiva do campo &quot;Texto do certificado&quot;.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="assinaturas">
                  <AccordionTrigger>Assinaturas</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Assinatura 1</Label>
                        <Select
                          value={certificateTemplate.signature1.source}
                          onValueChange={(value) =>
                            handleSignatureChange("signature1", "source", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coordinator">Coordenador</SelectItem>
                            <SelectItem value="instructor">Instrutor</SelectItem>
                            <SelectItem value="custom">Outro (manual)</SelectItem>
                            <SelectItem value="none">Sem assinatura</SelectItem>
                          </SelectContent>
                        </Select>
                        {certificateTemplate.signature1.source === "custom" && (
                          <div className="space-y-2">
                            <Input
                              placeholder="Nome"
                              value={certificateTemplate.signature1.name}
                              onChange={(e) =>
                                handleSignatureChange("signature1", "name", e.target.value)
                              }
                            />
                            <Input
                              placeholder="Cargo"
                              value={certificateTemplate.signature1.role}
                              onChange={(e) =>
                                handleSignatureChange("signature1", "role", e.target.value)
                              }
                            />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Assinatura 2</Label>
                        <Select
                          value={certificateTemplate.signature2.source}
                          onValueChange={(value) =>
                            handleSignatureChange("signature2", "source", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coordinator">Coordenador</SelectItem>
                            <SelectItem value="instructor">Instrutor</SelectItem>
                            <SelectItem value="custom">Outro (manual)</SelectItem>
                            <SelectItem value="none">Sem assinatura</SelectItem>
                          </SelectContent>
                        </Select>
                        {certificateTemplate.signature2.source === "custom" && (
                          <div className="space-y-2">
                            <Input
                              placeholder="Nome"
                              value={certificateTemplate.signature2.name}
                              onChange={(e) =>
                                handleSignatureChange("signature2", "name", e.target.value)
                              }
                            />
                            <Input
                              placeholder="Cargo"
                              value={certificateTemplate.signature2.role}
                              onChange={(e) =>
                                handleSignatureChange("signature2", "role", e.target.value)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="logos"
                  className="rounded-md border border-indigo-200 bg-indigo-50/40 px-3"
                >
                  <AccordionTrigger className="text-indigo-900">
                    Logos
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold">Logos</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddLogo}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar logo
                        </Button>
                      </div>
                      {logoPreviewItems.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Nenhum logo adicionado.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {logoPreviewItems.map((slot) => {
                            const position = getLogoPosition(slot.key);
                            return (
                              <div key={slot.key} className="space-y-3 rounded-md border p-4">
                                <div className="flex items-center justify-between">
                                  <Label className="font-semibold">{slot.label}</Label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                      {position.w}x{position.h} mm
                                    </span>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-red-600"
                                      onClick={() => handleRemoveLogo(slot.key)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <Input
                                  type="file"
                                  accept=".png,.jpg,.jpeg"
                                  onChange={(e) => handleLogoUpload(slot.key, e)}
                                />
                                {certificateTemplate.logos?.[slot.key] && (
                                  <img
                                    src={certificateTemplate.logos[slot.key]}
                                    alt={slot.label}
                                    className="h-16 object-contain border rounded-md p-2"
                                  />
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">X (mm)</Label>
                                    <Input
                                      type="number"
                                      value={position.x}
                                      onChange={(e) =>
                                        handleLogoPositionChange(slot.key, "x", e.target.value)
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Y (mm)</Label>
                                    <Input
                                      type="number"
                                      value={position.y}
                                      onChange={(e) =>
                                        handleLogoPositionChange(slot.key, "y", e.target.value)
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Largura (mm)</Label>
                                    <Input
                                      type="number"
                                      value={position.w}
                                      onChange={(e) =>
                                        handleLogoPositionChange(slot.key, "w", e.target.value)
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Altura (mm)</Label>
                                    <Input
                                      type="number"
                                      value={position.h}
                                      onChange={(e) =>
                                        handleLogoPositionChange(slot.key, "h", e.target.value)
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveCertificate}>
                  {selectedCertificateTraining
                    ? "Salvar modelo deste treinamento"
                    : "Salvar modelo padrão"}
                </Button>
                <Button variant="outline" onClick={handlePreviewPdf}>
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar PDF
                </Button>
                <Button variant="outline" onClick={handleResetCertificate}>
                  {selectedCertificateTraining
                    ? "Remover modelo deste treinamento"
                    : "Restaurar padrão"}
                </Button>
              </div>

              {certificateStatus && (
                <Alert
                  className={
                    certificateStatus.type === "error"
                      ? "border-red-200 bg-red-50"
                      : certificateStatus.type === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-green-200 bg-green-50"
                  }
                >
                  <AlertDescription
                    className={
                      certificateStatus.type === "error"
                        ? "text-red-800"
                        : certificateStatus.type === "warning"
                        ? "text-amber-800"
                        : "text-green-800"
                    }
                  >
                    {certificateStatus.message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
                )}
          </Card>
        </TabsContent>

        <TabsContent value="visualizar" className="mt-6">
          <Card className="border-violet-200 bg-violet-50/30">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-violet-900">
                    <Eye className="h-5 w-5 text-violet-700" />
                    Visualização do Certificado
                  </CardTitle>
                  <CardDescription className="mt-1 text-violet-900/80">
                    Pré-visualize o modelo com dados de exemplo.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-violet-300 text-violet-800 hover:bg-violet-100"
                  onClick={() => setIsCertificatePreviewOpen((prev) => !prev)}
                >
                  {isCertificatePreviewOpen ? "Ocultar seção" : "Mostrar seção"}
                </Button>
              </div>
            </CardHeader>
            {isCertificatePreviewOpen && (
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-normal">Editar:</Label>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    {[
                      { value: "logos", label: "Logos" },
                      { value: "textos", label: "Textos" },
                      { value: "assinaturas", label: "Assinaturas" },
                    ].map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={editLayer === option.value ? "default" : "ghost"}
                        onClick={() => setEditLayer(option.value)}
                        className="h-8"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="lock-logo-ratio"
                    checked={lockLogoRatio}
                    onCheckedChange={(checked) => setLockLogoRatio(Boolean(checked))}
                  />
                  <Label htmlFor="lock-logo-ratio" className="text-sm font-normal">
                    Travar proporção ao redimensionar
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-logo-grid"
                    checked={showLogoGrid}
                    onCheckedChange={(checked) => setShowLogoGrid(Boolean(checked))}
                  />
                  <Label htmlFor="show-logo-grid" className="text-sm font-normal">
                    Mostrar grade/guia
                  </Label>
                </div>
              </div>
              <div className="w-full">
                <div
                  ref={previewRef}
                  className="relative w-full overflow-hidden rounded-lg border bg-white shadow-sm"
                  style={{
                    paddingTop: `${(previewPage.height / previewPage.width) * 100}%`,
                    touchAction: "none",
                  }}
                >
                  {showLogoGrid && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px), " +
                          "linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)",
                        backgroundSize: "10% 10%",
                      }}
                    />
                  )}
                  <div className="absolute inset-0">
                    {logoPreviewItems.map((logo) => {
                      const left = toPercent(logo.position.x, previewPage.width);
                      const top = toPercent(logo.position.y, previewPage.height);
                      const width = toPercent(logo.position.w, previewPage.width);
                      const height = toPercent(logo.position.h, previewPage.height);
                      return (
                        <div
                          key={logo.key}
                          className="absolute text-[10px] text-slate-400"
                          style={{
                            left,
                            top,
                            width,
                            height,
                            touchAction: "none",
                            pointerEvents: editLayer === "logos" ? "auto" : "none",
                          }}
                          onPointerDown={
                            editLayer === "logos"
                              ? (event) => startMoveLogo(event, logo.key)
                              : undefined
                          }
                        >
                          <div className="relative h-full w-full">
                            {logo.dataUrl ? (
                              <img
                                src={logo.dataUrl}
                                alt={logo.label}
                                className="h-full w-full object-contain pointer-events-none select-none"
                                draggable={false}
                              />
                            ) : (
                              <div className="h-full w-full rounded border border-dashed border-slate-300 flex items-center justify-center text-[9px]">
                                {logo.label}
                              </div>
                            )}
                            <div className="absolute inset-0 border border-dashed border-blue-400" />
                            {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((handle) => {
                              const handleClasses = {
                                n: "left-1/2 top-[-6px] -translate-x-1/2 cursor-ns-resize",
                                s: "left-1/2 bottom-[-6px] -translate-x-1/2 cursor-ns-resize",
                                e: "right-[-6px] top-1/2 -translate-y-1/2 cursor-ew-resize",
                                w: "left-[-6px] top-1/2 -translate-y-1/2 cursor-ew-resize",
                                nw: "left-[-6px] top-[-6px] cursor-nwse-resize",
                                ne: "right-[-6px] top-[-6px] cursor-nesw-resize",
                                sw: "left-[-6px] bottom-[-6px] cursor-nesw-resize",
                                se: "right-[-6px] bottom-[-6px] cursor-nwse-resize",
                              };
                              const size = "h-3 w-3";
                              return (
                                <div
                                  key={handle}
                                  className={`absolute ${size} rounded-full bg-blue-500 ${handleClasses[handle]}`}
                                  onPointerDown={
                                    editLayer === "logos"
                                      ? (event) => startResizeLogo(event, logo.key, handle)
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {previewHeaderLines.length > 0 && (
                        <div
                          className="absolute left-1/2 top-4 -translate-x-1/2 text-center space-y-1 font-semibold text-slate-700"
                          style={{
                            fontFamily: previewFont,
                            fontSize: certificateTemplate.fonts?.headerSize || 10,
                            lineHeight: 1.2,
                          }}
                        >
                          {previewHeaderLines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      className="absolute inset-0 z-20"
                      style={{ pointerEvents: editLayer === "logos" ? "none" : "auto" }}
                    >
                      {(() => {
                        const titlePos = getTextPosition("title");
                        const bodyPos = getTextPosition("body");
                        const footerPos = getTextPosition("footer");
                        const signatureItems = [
                          { key: "signature1", label: "Assinatura 1", data: signature1 },
                          { key: "signature2", label: "Assinatura 2", data: signature2 },
                        ];

                        return (
                          <>
                            <div
                              className="absolute cursor-move"
                              style={{
                                left: toPercent(titlePos.x, previewPage.width),
                                top: toPercent(titlePos.y, previewPage.height),
                                width: toPercent(titlePos.width, previewPage.width),
                                transform: "translate(-50%, -50%)",
                                pointerEvents: editLayer === "textos" ? "auto" : "none",
                              }}
                              onPointerDown={
                                editLayer === "textos"
                                  ? (event) => startMoveText(event, "title")
                                  : undefined
                              }
                            >
                              <div
                                className="rounded border border-dashed border-blue-400 bg-white/70 px-2 py-1 text-center font-bold text-slate-900"
                                style={{
                                  fontFamily: previewFont,
                                  fontSize: certificateTemplate.fonts?.titleSize || 28,
                                }}
                              >
                                {previewTitle}
                              </div>
                            </div>

                            <div
                              className="absolute cursor-move"
                              style={{
                                left: toPercent(bodyPos.x, previewPage.width),
                                top: toPercent(bodyPos.y, previewPage.height),
                                width: toPercent(bodyPos.width, previewPage.width),
                                transform: "translate(-50%, -50%)",
                                pointerEvents: editLayer === "textos" ? "auto" : "none",
                              }}
                              onPointerDown={
                                editLayer === "textos"
                                  ? (event) => startMoveText(event, "body")
                                  : undefined
                              }
                            >
                              <div
                                className="rounded border border-dashed border-blue-400 bg-white/70 px-2 py-1 text-slate-700"
                                style={{
                                  fontFamily: previewFont,
                                  fontSize: bodyFontSizeValue,
                                  textAlign: isBodyJustified ? "justify" : "left",
                                  lineHeight: bodyLineHeightValue,
                                }}
                              >
                                <div
                                  className="[&_ol]:list-decimal [&_ol]:pl-6 [&_p.ql-align-center]:text-center [&_p.ql-align-justify]:text-justify [&_p.ql-align-right]:text-right [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-6 [&_.ql-indent-1]:pl-6 [&_.ql-indent-2]:pl-10 [&_.ql-indent-3]:pl-14"
                                  style={{
                                    textIndent: `${bodyIndentPercent}%`,
                                    wordSpacing: isBodyJustified
                                      ? `${Math.max(0, bodyMaxWordSpacingValue - 1) * 0.06}em`
                                      : undefined,
                                  }}
                                  dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
                                />
                              </div>
                            </div>

                            {previewFooter && (
                              <div
                                className="absolute cursor-move"
                                style={{
                                  left: toPercent(footerPos.x, previewPage.width),
                                  top: toPercent(footerPos.y, previewPage.height),
                                  width: toPercent(footerPos.width, previewPage.width),
                                  transform: "translate(-50%, -50%)",
                                  pointerEvents: editLayer === "textos" ? "auto" : "none",
                                }}
                                onPointerDown={
                                  editLayer === "textos"
                                    ? (event) => startMoveText(event, "footer")
                                    : undefined
                                }
                              >
                                <div
                                  className="rounded border border-dashed border-blue-400 bg-white/70 px-2 py-1 text-center text-slate-700"
                                  style={{
                                    fontFamily: previewFont,
                                    fontSize: certificateTemplate.fonts?.footerSize || 12,
                                  }}
                                >
                                  {previewFooter}
                                </div>
                              </div>
                            )}

                            {signatureItems.map((item) => {
                              const pos = getSignaturePosition(item.key);
                              const width = toPercent(pos.lineWidth, previewPage.width);
                              return (
                                <div
                                  key={item.key}
                                  className="absolute cursor-move"
                                  style={{
                                    left: toPercent(pos.x, previewPage.width),
                                    top: toPercent(pos.y, previewPage.height),
                                    width,
                                    transform: "translate(-50%, 0)",
                                    pointerEvents:
                                      editLayer === "assinaturas" ? "auto" : "none",
                                  }}
                                  onPointerDown={
                                    editLayer === "assinaturas"
                                      ? (event) => startMoveSignature(event, item.key)
                                      : undefined
                                  }
                                >
                                  <div className="border-b border-slate-400" />
                                  <div
                                    className="mt-1 text-center text-slate-700"
                                    style={{
                                      fontFamily: previewFont,
                                      fontSize: certificateTemplate.fonts?.signatureSize || 11,
                                    }}
                                  >
                                    <p className="font-semibold">
                                      {item.data?.name || item.label}
                                    </p>
                                    {item.data?.role && (
                                      <p
                                        className="text-slate-500"
                                        style={{
                                          fontFamily: previewFont,
                                          fontSize:
                                            certificateTemplate.fonts?.signatureRoleSize || 9,
                                        }}
                                      >
                                        {item.data.role}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-6 border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-900">
                <Mail className="h-5 w-5 text-emerald-700" />
                Envio de e-mails
              </CardTitle>
              <CardDescription className="mt-1 text-emerald-900/80">
                Configure o remetente e o webhook para envio dos certificados.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => setIsEmailSettingsOpen((prev) => !prev)}
            >
              {isEmailSettingsOpen ? "Ocultar seção" : "Mostrar seção"}
            </Button>
          </div>
        </CardHeader>
        {isEmailSettingsOpen && (
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Para Outlook, use um webhook (ex: Power Automate ou Microsoft Graph).
              O serviço precisa permitir o remetente informado.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email-from">E-mail de envio</Label>
              <Input
                id="email-from"
                type="email"
                placeholder="exemplo@dominio.com"
                value={emailSettings.fromEmail}
                onChange={(e) =>
                  handleEmailSettingChange("fromEmail", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-name">Nome do remetente</Label>
              <Input
                id="email-name"
                placeholder="Equipe de Treinamentos"
                value={emailSettings.fromName}
                onChange={(e) =>
                  handleEmailSettingChange("fromName", e.target.value)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-webhook">Webhook de e-mail</Label>
            <Input
              id="email-webhook"
              type="url"
              placeholder="https://seu-webhook.com/send-email"
              value={emailSettings.webhookUrl}
              onChange={(e) =>
                handleEmailSettingChange("webhookUrl", e.target.value)
              }
            />
            <p className="text-xs text-slate-500">
              Se vazio, será usada a função do Supabase configurada no ambiente.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSaveEmailSettings}>
              Salvar
            </Button>
            <Button type="button" variant="outline" onClick={handleClearEmailSettings}>
              Limpar
            </Button>
          </div>

          <div className="border-t pt-4 space-y-4">
            <div>
              <h4 className="font-semibold text-sm text-slate-700">
                Mensagem do e-mail do certificado
              </h4>
              <p className="text-xs text-slate-500">
                Personalize o assunto e o corpo do e-mail enviado junto com o PDF.
              </p>
            </div>

            <Alert>
              <AlertDescription>
                Variáveis disponíveis: {"{{nome}}"}, {"{{treinamento}}"},
                {"{{tipo_certificado}}"}, {"{{funcao}}"}, {"{{aula}}"},
                {"{{periodo_treinamento}}"}, {"{{dias_treinamento}}"},
                {"{{data}}"}, {"{{carga_horaria}}"}, {"{{coordenador}}"} e {"{{instrutor}}"}.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="email-template-subject">Assunto do e-mail</Label>
              <Input
                id="email-template-subject"
                value={certificateEmailTemplate.subject}
                onChange={(e) => handleEmailTemplateChange("subject", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-template-body">Mensagem (HTML)</Label>
              <Textarea
                id="email-template-body"
                rows={6}
                value={certificateEmailTemplate.body}
                onChange={(e) => handleEmailTemplateChange("body", e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Você pode usar tags HTML simples (p, br, strong).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSaveEmailTemplate}>
                Salvar mensagem
              </Button>
              <Button type="button" variant="outline" onClick={handleResetEmailTemplate}>
                Restaurar padrão
              </Button>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Prévia
              </p>
              <p className="font-semibold mb-2">{previewEmailSubject}</p>
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: previewEmailBody }}
              />
            </div>

            {emailTemplateStatus && (
              <Alert
                className={
                  emailTemplateStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : "border-green-200 bg-green-50"
                }
              >
                <AlertDescription
                  className={
                    emailTemplateStatus.type === "error"
                      ? "text-red-800"
                      : "text-green-800"
                  }
                >
                  {emailTemplateStatus.message}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {emailStatus && (
            <Alert
              className={
                emailStatus.type === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
              }
            >
              <AlertDescription
                className={
                  emailStatus.type === "error"
                    ? "text-red-800"
                    : "text-green-800"
                }
              >
                {emailStatus.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        )}
      </Card>
    </TabsContent>

        <TabsContent value="exportacao" className="mt-6">
          <DataExport />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <UserManagementPanel />
        </TabsContent>

        <TabsContent value="sobre" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Sobre o Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-slate-600">
                <p><strong>Sistema:</strong> Centro de Oftalmologia Sanitária</p>
                <p><strong>Versão:</strong> 1.0</p>
                <p><strong>Módulos:</strong> Treinamentos, Profissionais, Estoque, Agenda</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}