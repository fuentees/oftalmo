import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Palette, Check, FileSpreadsheet, Trash2, Download } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataExport from "@/components/settings/DataExport";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function Settings() {
  const [selectedColor, setSelectedColor] = useState("blue");
  const [gveMapping, setGveMapping] = useState([]);
  const [mappingStatus, setMappingStatus] = useState(null);

  useEffect(() => {
    const savedColor = localStorage.getItem("theme-color") || "blue";
    setSelectedColor(savedColor);
    applyColor(savedColor);
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

      <DataExport />

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
    </div>
  );
}