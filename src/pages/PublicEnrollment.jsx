import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  GraduationCap, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Video
} from "lucide-react";
import { format } from "date-fns";

export default function PublicEnrollment() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");
  
  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    rg: "",
    email: "",
    sector: "",
    registration: "",
    professional_formation: "",
    institution: "",
    state: "",
    health_region: "",
    municipality: "",
    unit_name: "",
    work_address: "",
    residential_address: "",
    commercial_phone: "",
    mobile_phone: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [formErrors, setFormErrors] = useState({
    name: null,
    cpf: null,
    rg: null,
    email: null,
    sector: null,
    registration: null,
    professional_formation: null,
    institution: null,
    state: null,
    health_region: null,
    municipality: null,
    unit_name: null,
    work_address: null,
    residential_address: null,
    commercial_phone: null,
    mobile_phone: null,
  });

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find(t => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const formatDateSafe = (value, pattern = "dd/MM/yyyy") => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, pattern);
  };

  const formatCpf = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  };

  const formatRg = (value) => {
    const cleaned = value.replace(/[^0-9xX]/g, "").slice(0, 12);
    return cleaned.toUpperCase();
  };

  const trainingDates = Array.isArray(training?.dates) ? training.dates : [];

  const enrollMutation = useMutation({
    mutationFn: async (data) => {
      // Check if already enrolled
      const existing = await dataClient.entities.TrainingParticipant.filter({
        training_id: trainingId,
        professional_cpf: data.cpf,
      });

      if (existing && existing.length > 0) {
        throw new Error("CPF já inscrito neste treinamento");
      }

      // Check capacity
      if (training.max_participants && training.participants_count >= training.max_participants) {
        throw new Error("Treinamento com vagas esgotadas");
      }

      const firstDate = trainingDates.length > 0 ? trainingDates[0].date : null;
      const baseDate = firstDate ? new Date(firstDate) : null;
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(
              new Date(
                baseDate.setMonth(baseDate.getMonth() + training.validity_months)
              ),
              "yyyy-MM-dd"
            )
          : null;

      await dataClient.entities.TrainingParticipant.create({
        training_id: trainingId,
        training_title: training.title,
        training_date: firstDate,
        professional_name: data.name,
        professional_cpf: data.cpf,
        professional_rg: data.rg,
        professional_email: data.email,
        professional_sector: data.sector,
        professional_registration: data.registration,
        professional_formation: data.professional_formation,
        institution: data.institution,
        state: data.state,
        health_region: data.health_region,
        municipality: data.municipality,
        unit_name: data.unit_name,
        work_address: data.work_address,
        residential_address: data.residential_address,
        commercial_phone: data.commercial_phone,
        mobile_phone: data.mobile_phone,
        enrollment_status: "inscrito",
        enrollment_date: new Date().toISOString(),
        attendance_records: [],
        attendance_percentage: 0,
        approved: false,
        certificate_issued: false,
        validity_date: validityDate,
      });

      // Update training count
      await dataClient.entities.Training.update(trainingId, {
        participants_count: (training.participants_count || 0) + 1,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    const cpfDigits = String(formData.cpf || "").replace(/\D/g, "");
    const rgDigits = String(formData.rg || "").replace(/\D/g, "");
    const commercialDigits = String(formData.commercial_phone || "").replace(/\D/g, "");
    const mobileDigits = String(formData.mobile_phone || "").replace(/\D/g, "");

    if (!formData.name?.trim()) errors.name = "Campo obrigatório.";
    if (!formData.rg?.trim() || rgDigits.length < 5 || rgDigits.length > 12) {
      errors.rg = "RG inválido.";
    }
    if (formData.cpf?.trim()) {
      const isValidCpf = (() => {
        if (cpfDigits.length !== 11 || /^(\d)\1+$/.test(cpfDigits)) return false;
        let sum = 0;
        for (let i = 0; i < 9; i += 1) sum += Number(cpfDigits[i]) * (10 - i);
        let check = (sum * 10) % 11;
        if (check === 10) check = 0;
        if (check !== Number(cpfDigits[9])) return false;
        sum = 0;
        for (let i = 0; i < 10; i += 1) sum += Number(cpfDigits[i]) * (11 - i);
        check = (sum * 10) % 11;
        if (check === 10) check = 0;
        return check === Number(cpfDigits[10]);
      })();
      if (!isValidCpf) {
        errors.cpf = "CPF inválido.";
      }
    }
    if (!formData.professional_formation?.trim()) errors.professional_formation = "Campo obrigatório.";
    if (!formData.institution?.trim()) errors.institution = "Campo obrigatório.";
    if (!formData.state?.trim()) errors.state = "Campo obrigatório.";
    if (!formData.municipality?.trim()) errors.municipality = "Campo obrigatório.";
    if (!formData.health_region?.trim()) errors.health_region = "Campo obrigatório.";
    if (!formData.unit_name?.trim()) errors.unit_name = "Campo obrigatório.";
    if (!formData.sector?.trim()) errors.sector = "Campo obrigatório.";
    if (!formData.work_address?.trim()) errors.work_address = "Campo obrigatório.";
    if (!formData.residential_address?.trim()) errors.residential_address = "Campo obrigatório.";
    if (!formData.email?.trim()) {
      errors.email = "Campo obrigatório.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "E-mail inválido.";
    }
    if (commercialDigits.length < 10 || commercialDigits.length > 11) {
      errors.commercial_phone = "Telefone inválido.";
    }
    if (mobileDigits.length < 10 || mobileDigits.length > 11) {
      errors.mobile_phone = "Celular inválido.";
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    enrollMutation.mutate(formData);
  };

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link de inscrição inválido. Entre em contato com o administrador.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Treinamento não encontrado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Inscrição Realizada!</h2>
              <p className="text-slate-600 mt-2">
                Sua inscrição foi confirmada com sucesso.
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm text-slate-600">
                <strong>Treinamento:</strong> {training.title}
              </p>
              {trainingDates.length > 0 && (
                <div>
                  <p className="text-sm text-slate-600 font-semibold mb-1">Datas:</p>
                  {trainingDates.map((dateItem, index) => (
                    <p key={index} className="text-sm text-slate-600 pl-3">
                      • {formatDateSafe(dateItem.date)}
                      {dateItem.start_time && dateItem.end_time && ` - ${dateItem.start_time} às ${dateItem.end_time}`}
                    </p>
                  ))}
                </div>
              )}
              {training.location && (
                <p className="text-sm text-slate-600">
                  <strong>Local:</strong> {training.location}
                </p>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Aguarde confirmação por e-mail. Compareça 15 minutos antes do horário.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFullyBooked = training.max_participants && training.participants_count >= training.max_participants;
  const isCancelled = training.status === "cancelado";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Inscrição em Treinamento</CardTitle>
                <p className="text-blue-100 text-sm mt-1">Preencha os dados para confirmar sua participação</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-6">
            {/* Training Info */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-lg text-slate-900">{training.title}</h3>
              {training.code && (
                <p className="text-sm text-slate-600">Código: {training.code}</p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Datas e Horários:</p>
                {trainingDates.length > 0 ? (
                  trainingDates.map((dateItem, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm text-slate-700 pl-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span>{formatDateSafe(dateItem.date)}</span>
                      {dateItem.start_time && dateItem.end_time && (
                        <>
                          <Clock className="h-4 w-4 text-blue-600" />
                          <span>{dateItem.start_time} - {dateItem.end_time}</span>
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span>Data a definir</span>
                  </div>
                )}
                {training.location && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    {training.location}
                  </div>
                )}
                {training.online_link && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Video className="h-4 w-4 text-blue-600" />
                    <span>Treinamento Online</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <User className="h-4 w-4 text-blue-600" />
                  Instrutor: {training.instructor}
                </div>
              </div>
              {training.max_participants && (
                <p className="text-sm text-slate-600">
                  Vagas: {training.participants_count || 0} / {training.max_participants}
                </p>
              )}
            </div>

            {(isFullyBooked || isCancelled) && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {isCancelled ? "Este treinamento foi cancelado." : "Vagas esgotadas para este treinamento."}
                </AlertDescription>
              </Alert>
            )}

            {enrollMutation.isError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {enrollMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            {!isFullyBooked && !isCancelled && (
              <form onSubmit={handleSubmit} className="space-y-6">
                <Tabs defaultValue="pessoais" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
                    <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
                    <TabsTrigger value="instituicao">Instituição</TabsTrigger>
                    <TabsTrigger value="enderecos">Endereços</TabsTrigger>
                    <TabsTrigger value="contatos">Contatos</TabsTrigger>
                  </TabsList>

                  <TabsContent value="pessoais" className="mt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="name">Nome Completo *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rg">RG *</Label>
                        <Input
                          id="rg"
                          value={formData.rg}
                          onChange={(e) => {
                            const nextValue = formatRg(e.target.value);
                            setFormData({ ...formData, rg: nextValue });
                            if (formErrors.rg) {
                              setFormErrors((prev) => ({ ...prev, rg: null }));
                            }
                          }}
                          required
                        />
                        {formErrors.rg && <p className="text-xs text-red-600">{formErrors.rg}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cpf">CPF</Label>
                        <Input
                          id="cpf"
                          value={formData.cpf}
                          onChange={(e) => {
                            const nextValue = formatCpf(e.target.value);
                            setFormData({ ...formData, cpf: nextValue });
                            if (formErrors.cpf) {
                              setFormErrors((prev) => ({ ...prev, cpf: null }));
                            }
                          }}
                          placeholder="000.000.000-00"
                        />
                        {formErrors.cpf && <p className="text-xs text-red-600">{formErrors.cpf}</p>}
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="professional_formation">Formação Profissional *</Label>
                        <Input
                          id="professional_formation"
                          value={formData.professional_formation}
                          onChange={(e) => setFormData({...formData, professional_formation: e.target.value})}
                          required
                        />
                        {formErrors.professional_formation && (
                          <p className="text-xs text-red-600">{formErrors.professional_formation}</p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="instituicao" className="mt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="institution">Instituição que Representa *</Label>
                        <Input
                          id="institution"
                          value={formData.institution}
                          onChange={(e) => setFormData({...formData, institution: e.target.value})}
                          required
                        />
                        {formErrors.institution && (
                          <p className="text-xs text-red-600">{formErrors.institution}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">Estado *</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => setFormData({...formData, state: e.target.value})}
                          placeholder="Ex: SP"
                          required
                        />
                        {formErrors.state && <p className="text-xs text-red-600">{formErrors.state}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="municipality">Município *</Label>
                        <Input
                          id="municipality"
                          value={formData.municipality}
                          onChange={(e) => setFormData({...formData, municipality: e.target.value})}
                          required
                        />
                        {formErrors.municipality && (
                          <p className="text-xs text-red-600">{formErrors.municipality}</p>
                        )}
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="health_region">Regional de Saúde / Grupo de Vigilância Epidemiológica *</Label>
                        <Input
                          id="health_region"
                          value={formData.health_region}
                          onChange={(e) => setFormData({...formData, health_region: e.target.value})}
                          required
                        />
                        {formErrors.health_region && (
                          <p className="text-xs text-red-600">{formErrors.health_region}</p>
                        )}
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="unit_name">Nome da Unidade *</Label>
                        <Input
                          id="unit_name"
                          value={formData.unit_name}
                          onChange={(e) => setFormData({...formData, unit_name: e.target.value})}
                          required
                        />
                        {formErrors.unit_name && <p className="text-xs text-red-600">{formErrors.unit_name}</p>}
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="sector">Cargo *</Label>
                        <Input
                          id="sector"
                          value={formData.sector}
                          onChange={(e) => setFormData({...formData, sector: e.target.value})}
                          required
                        />
                        {formErrors.sector && <p className="text-xs text-red-600">{formErrors.sector}</p>}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="enderecos" className="mt-6">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="work_address">Endereço de Trabalho *</Label>
                        <Input
                          id="work_address"
                          value={formData.work_address}
                          onChange={(e) => setFormData({...formData, work_address: e.target.value})}
                          required
                        />
                        {formErrors.work_address && (
                          <p className="text-xs text-red-600">{formErrors.work_address}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="residential_address">Endereço de Residência *</Label>
                        <Input
                          id="residential_address"
                          value={formData.residential_address}
                          onChange={(e) => setFormData({...formData, residential_address: e.target.value})}
                          required
                        />
                        {formErrors.residential_address && (
                          <p className="text-xs text-red-600">{formErrors.residential_address}</p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="contatos" className="mt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="email">E-mail *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          required
                        />
                        {formErrors.email && <p className="text-xs text-red-600">{formErrors.email}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="commercial_phone">Telefone Comercial *</Label>
                        <Input
                          id="commercial_phone"
                          value={formData.commercial_phone}
                          onChange={(e) => {
                            const nextValue = formatPhone(e.target.value);
                            setFormData({ ...formData, commercial_phone: nextValue });
                            if (formErrors.commercial_phone) {
                              setFormErrors((prev) => ({ ...prev, commercial_phone: null }));
                            }
                          }}
                          placeholder="(11) 1234-5678"
                          required
                        />
                        {formErrors.commercial_phone && (
                          <p className="text-xs text-red-600">{formErrors.commercial_phone}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mobile_phone">Celular *</Label>
                        <Input
                          id="mobile_phone"
                          value={formData.mobile_phone}
                          onChange={(e) => {
                            const nextValue = formatPhone(e.target.value);
                            setFormData({ ...formData, mobile_phone: nextValue });
                            if (formErrors.mobile_phone) {
                              setFormErrors((prev) => ({ ...prev, mobile_phone: null }));
                            }
                          }}
                          placeholder="(11) 91234-5678"
                          required
                        />
                        {formErrors.mobile_phone && (
                          <p className="text-xs text-red-600">{formErrors.mobile_phone}</p>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={enrollMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  >
                    {enrollMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      "Confirmar Inscrição"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}