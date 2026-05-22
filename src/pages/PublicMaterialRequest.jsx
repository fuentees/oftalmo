import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { format } from "date-fns";
import { Package, Send, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicMaterialRequest() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [gvesName, setGvesName] = useState("");
  const [responsible, setResponsible] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("materials")
      .select("*")
      .eq("available_for_request", true)
      .order("name")
      .then(({ data, error: err }) => {
        if (!err && data) {
          setMaterials(data);
          const init = {};
          data.forEach((m) => { init[m.id] = ""; });
          setQuantities(init);
        }
        setLoading(false);
      });
  }, []);

  const selectedCount = materials.filter((m) => Number(quantities[m.id]) > 0).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!gvesName.trim()) {
      setError("Informe o nome do GVES ou município.");
      return;
    }

    const items = materials.filter((m) => Number(quantities[m.id]) > 0);
    if (!items.length) {
      setError("Informe a quantidade de pelo menos um material.");
      return;
    }

    setSubmitting(true);
    try {
      const records = items.map((m) => ({
        item_name: m.name,
        quantity: Number(quantities[m.id]),
        unit: m.unit || null,
        requested_by: responsible.trim()
          ? `${gvesName.trim()} — ${responsible.trim()}`
          : gvesName.trim(),
        status: "pendente",
        request_date: new Date().toISOString().split("T")[0],
      }));

      const { error: insertError } = await supabase
        .from("material_requests")
        .insert(records);

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center shadow-xl border-0">
          <CardContent className="pt-12 pb-12 space-y-5">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Solicitação Enviada!</h2>
            <p className="text-slate-500 leading-relaxed">
              Sua solicitação foi recebida com sucesso e será analisada pela equipe do Centro de Oftalmologia Sanitária.
            </p>
            <p className="text-xs text-slate-400">
              Em caso de dúvidas, entre em contato com a equipe responsável.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-8 px-6 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Solicitação de Materiais</h1>
            <p className="text-blue-100 text-sm mt-0.5">Centro de Oftalmologia Sanitária</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Identificação */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Identificação do Solicitante
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">GVES / Município <span className="text-red-500">*</span></Label>
                <Input
                  value={gvesName}
                  onChange={(e) => setGvesName(e.target.value)}
                  placeholder="Ex: GVES Campinas ou Município de Indaiatuba"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Responsável pela Solicitação</Label>
                <Input
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  placeholder="Nome do responsável"
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de materiais */}
        <Card className="shadow-md border-0 overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Materiais Disponíveis
                </CardTitle>
                <p className="text-xs text-slate-400 mt-1">
                  Preencha as quantidades desejadas. Deixe em branco para não solicitar.
                </p>
              </div>
              {selectedCount > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                  {selectedCount} selecionado{selectedCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardHeader>

          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
              Carregando materiais...
            </div>
          ) : materials.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Package className="h-14 w-14 mx-auto mb-3 text-slate-200" />
              <p className="font-medium">Nenhum material disponível no momento</p>
              <p className="text-xs mt-1">Entre em contato com a equipe responsável.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="w-10 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-4">#</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-4">Material</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-4 w-28">Unidade</th>
                    <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-4 w-36">
                      Quantidade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => {
                    const qty = Number(quantities[m.id]);
                    const hasQty = qty > 0;
                    return (
                      <tr
                        key={m.id}
                        className={`border-b border-slate-100 transition-colors ${
                          hasQty ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        }`}
                      >
                        <td className="py-3 px-4 text-sm text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="py-3 px-4">
                          <p className={`font-medium ${hasQty ? "text-blue-800" : "text-slate-800"}`}>
                            {m.name}
                          </p>
                          {m.category && (
                            <p className="text-xs text-slate-400 mt-0.5">{m.category}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-500">{m.unit || "—"}</td>
                        <td className="py-3 px-4">
                          <Input
                            type="number"
                            min="0"
                            value={quantities[m.id] ?? ""}
                            onChange={(e) =>
                              setQuantities((q) => ({ ...q, [m.id]: e.target.value }))
                            }
                            className={`text-center h-9 font-semibold transition-colors ${
                              hasQty
                                ? "border-blue-400 text-blue-700 bg-white"
                                : "bg-white"
                            }`}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Erro */}
        {error && (
          <Alert className="border-red-200 bg-red-50 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {/* Resumo + Enviar */}
        {materials.length > 0 && (
          <Card className={`shadow-md border-0 transition-all ${selectedCount > 0 ? "border-l-4 border-l-blue-500" : ""}`}>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-800">
                    {selectedCount > 0
                      ? `${selectedCount} material(is) na solicitação`
                      : "Nenhum material selecionado"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Revise as quantidades antes de enviar
                  </p>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !gvesName.trim() || selectedCount === 0}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 min-w-[180px] shadow-lg shadow-blue-500/20"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Enviar Solicitação
                    </span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 pb-4">
          Centro de Oftalmologia Sanitária © {format(new Date(), "yyyy")}
        </p>
      </div>
    </div>
  );
}
