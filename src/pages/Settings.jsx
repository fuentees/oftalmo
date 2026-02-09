import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataExport from "@/components/settings/DataExport";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import {
  DEFAULT_CERTIFICATE_TEMPLATE,
  loadCertificateTemplate,
  resetCertificateTemplate,
  saveCertificateTemplate,
} from "@/lib/certificateTemplate";

export default function Settings() {
  const [selectedColor, setSelectedColor] = useState("blue");
  const [gveMapping, setGveMapping] = useState([]);
  const [mappingStatus, setMappingStatus] = useState(null);
  const [certificateTemplate, setCertificateTemplate] = useState(
    DEFAULT_CERTIFICATE_TEMPLATE
  );
  const [certificateStatus, setCertificateStatus] = useState(null);

  useEffect(() => {
    const savedColor = localStorage.getItem("theme-color") || "blue";
    setSelectedColor(savedColor);
    applyColor(savedColor);
  }, []);

  useEffect(() => {
    const template = loadCertificateTemplate();
    setCertificateTemplate(template);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gveMappingSp");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setGveMapping(parsed);
      }
    } catch (error) {
      // Ignora erro de leitura
    }
  }, []);

  const colors = [
    { name: "Azul", value: "blue", classes: "bg-blue-900 border-blue-800 bg-blue-500 text-blue-100 hover:bg-blue-800 bg-blue-600 hover:bg-blue-700" },
    { name: "Verde", value: "green", classes: "bg-green-900 border-green-800 bg-green-500 text-green-100 hover:bg-green-800 bg-green-600 hover:bg-green-700" },
    { name: "Roxo", value: "purple", classes: "bg-purple-900 border-purple-800 bg-purple-500 text-purple-100 hover:bg-purple-800 bg-purple-600 hover:bg-purple-700" },
    { name: "Laranja", value: "orange", classes: "bg-orange-900 border-orange-800 bg-orange-500 text-orange-100 hover:bg-orange-800 bg-orange-600 hover:bg-orange-700" },
    { name: "Rosa", value: "pink", classes: "bg-pink-900 border-pink-800 bg-pink-500 text-pink-100 hover:bg-pink-800 bg-pink-600 hover:bg-pink-700" },
    { name: "Ciano", value: "cyan", classes: "bg-cyan-900 border-cyan-800 bg-cyan-500 text-cyan-100 hover:bg-cyan-800 bg-cyan-600 hover:bg-cyan-700" },
  ];

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

  const handleSignatureChange = (key, field, value) => {
    setCertificateTemplate((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const handleLogoUpload = (field, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCertificateTemplate((prev) => ({
        ...prev,
        logos: {
          ...prev.logos,
          [field]: dataUrl,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const logoSlots = [
    { key: "primary", label: "Logo 1" },
    { key: "secondary", label: "Logo 2" },
    { key: "tertiary", label: "Logo 3" },
    { key: "quaternary", label: "Logo 4" },
  ];

  const defaultLogoPositions = useMemo(
    () => ({
      primary: { x: 20, y: 18, w: 30, h: 30 },
      secondary: { x: 247, y: 18, w: 30, h: 30 },
      tertiary: { x: 20, y: 160, w: 30, h: 30 },
      quaternary: { x: 247, y: 160, w: 30, h: 30 },
    }),
    []
  );

  const getLogoPosition = (key) => {
    const base = defaultLogoPositions[key] || { x: 20, y: 18, w: 30, h: 30 };
    const stored = certificateTemplate.logoPositions?.[key] || {};
    return {
      x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
      y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
      w: Number.isFinite(Number(stored.w)) ? Number(stored.w) : base.w,
      h: Number.isFinite(Number(stored.h)) ? Number(stored.h) : base.h,
    };
  };

  const handleLogoPositionChange = (key, field, value) => {
    const numeric = Number(value);
    setCertificateTemplate((prev) => ({
      ...prev,
      logoPositions: {
        ...defaultLogoPositions,
        ...(prev.logoPositions || {}),
        [key]: {
          ...defaultLogoPositions[key],
          ...(prev.logoPositions?.[key] || {}),
          [field]: Number.isFinite(numeric) ? numeric : 0,
        },
      },
    }));
  };

  const handleSaveCertificate = () => {
    saveCertificateTemplate(certificateTemplate);
    setCertificateStatus({
      type: "success",
      message: "Modelo de certificado salvo com sucesso.",
    });
  };

  const handleResetCertificate = () => {
    const reset = resetCertificateTemplate();
    setCertificateTemplate(reset);
    setCertificateStatus({
      type: "success",
      message: "Modelo padrão restaurado.",
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
  };

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
  const previewTitle = certificateTemplate.title || "CERTIFICADO";
  const previewBody = interpolateText(certificateTemplate.body || "", previewData);
  const previewFooter = certificateTemplate.footer
    ? interpolateText(certificateTemplate.footer, previewData)
    : "";
  const signature1 = resolveSignature(certificateTemplate.signature1);
  const signature2 = resolveSignature(certificateTemplate.signature2);

  const previewPage = { width: 297, height: 210 };
  const toPercent = (value, total) => `${(value / total) * 100}%`;

  const logoPreviewItems = useMemo(
    () =>
      logoSlots.map((slot) => {
        const position = getLogoPosition(slot.key);
        return {
          ...slot,
          position,
          dataUrl: certificateTemplate.logos?.[slot.key] || "",
        };
      }),
    [certificateTemplate, logoSlots]
  );

  const normalizeHeader = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

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

    const unique = [];
    const seen = new Set();
    mapped.forEach((item) => {
      const key = normalizeText(item.municipio);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });
    return unique;
  };

  const handleMappingFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMappingStatus({ type: "loading", message: "Lendo planilha..." });
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
      localStorage.setItem("gveMappingSp", JSON.stringify(mapping));
      setGveMapping(mapping);
      setMappingStatus({
        type: "success",
        message: `${mapping.length} municípios carregados.`,
      });
    } catch (error) {
      setMappingStatus({
        type: "error",
        message: error.message || "Erro ao importar planilha.",
      });
    }
  };

  const handleClearMapping = () => {
    localStorage.removeItem("gveMappingSp");
    setGveMapping([]);
    setMappingStatus({
      type: "success",
      message: "Planilha removida.",
    });
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
        <TabsList className="grid w-full grid-cols-2 gap-2 lg:grid-cols-5">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-slate-700" />
                Visualização do Certificado
              </CardTitle>
              <CardDescription>
                Pré-visualize o modelo com dados de exemplo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full">
                <div
                  className="relative w-full overflow-hidden rounded-lg border bg-white shadow-sm"
                  style={{
                    paddingTop: `${(previewPage.height / previewPage.width) * 100}%`,
                  }}
                >
                  <div className="absolute inset-0">
                    {logoPreviewItems.map((logo) => {
                      const left = toPercent(logo.position.x, previewPage.width);
                      const top = toPercent(logo.position.y, previewPage.height);
                      const width = toPercent(logo.position.w, previewPage.width);
                      const height = toPercent(logo.position.h, previewPage.height);
                      return (
                        <div
                          key={logo.key}
                          className="absolute flex items-center justify-center text-[10px] text-slate-400"
                          style={{ left, top, width, height }}
                        >
                          {logo.dataUrl ? (
                            <img
                              src={logo.dataUrl}
                              alt={logo.label}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="h-full w-full rounded border border-dashed border-slate-300 flex items-center justify-center text-[9px]">
                              {logo.label}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="absolute inset-0 z-10 flex flex-col items-center text-center px-10 pt-10">
                      {previewHeaderLines.length > 0 && (
                        <div className="space-y-1 text-xs font-semibold text-slate-700">
                          {previewHeaderLines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      )}

                      <h2 className="mt-6 text-xl font-bold text-slate-900">
                        {previewTitle}
                      </h2>

                      <p className="mt-4 text-sm text-slate-700 whitespace-pre-line max-w-3xl">
                        {previewBody}
                      </p>

                      {previewFooter && (
                        <p className="mt-6 text-sm text-slate-700">{previewFooter}</p>
                      )}

                      <div className="mt-auto w-full pb-8">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          {[signature1, signature2].map((signature, index) => (
                            <div
                              key={`signature-${index}`}
                              className="text-center text-xs text-slate-700"
                            >
                              <div className="h-8 border-b border-slate-300" />
                              {signature?.name && (
                                <p className="mt-2 font-semibold">{signature.name}</p>
                              )}
                              {signature?.role && (
                                <p className="text-[10px] text-slate-500">{signature.role}</p>
                              )}
                              {!signature && (
                                <p className="mt-2 text-[10px] text-slate-400">
                                  Sem assinatura
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                {gveMapping.length > 0
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificados" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Modelo de Certificado
              </CardTitle>
              <CardDescription>
                Configure textos, assinaturas e logos do certificado padrão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Variáveis disponíveis: {"{{nome}}"}, {"{{rg}}"}, {"{{treinamento}}"},
                  {"{{carga_horaria}}"}, {"{{data}}"}, {"{{entidade}}"},
                  {"{{coordenador}}"} e {"{{instrutor}}"}.
                </AlertDescription>
              </Alert>

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
                <Label>Texto do certificado</Label>
                <Textarea
                  value={certificateTemplate.body}
                  onChange={(e) => handleCertificateChange("body", e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Rodapé (cidade/data)</Label>
                <Input
                  value={certificateTemplate.footer}
                  onChange={(e) => handleCertificateChange("footer", e.target.value)}
                />
              </div>

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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {logoSlots.map((slot) => {
              const position = getLogoPosition(slot.key);
              return (
                <div key={slot.key} className="space-y-3 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">{slot.label}</Label>
                    <span className="text-xs text-slate-500">
                      {position.w}x{position.h} mm
                    </span>
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

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveCertificate}>Salvar</Button>
                <Button variant="outline" onClick={handleResetCertificate}>
                  Restaurar padrão
                </Button>
              </div>

              {certificateStatus && (
                <Alert
                  className={
                    certificateStatus.type === "error"
                      ? "border-red-200 bg-red-50"
                      : "border-green-200 bg-green-50"
                  }
                >
                  <AlertDescription
                    className={
                      certificateStatus.type === "error"
                        ? "text-red-800"
                        : "text-green-800"
                    }
                  >
                    {certificateStatus.message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exportacao" className="mt-6">
          <DataExport />
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