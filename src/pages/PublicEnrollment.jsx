import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [formErrors, setFormErrors] = useState({});

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find(t => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: enrollmentFields = [] } = useQuery({
    queryKey: ["public-enrollment-fields", trainingId],
    queryFn: async () => {
      const allFields = await dataClient.entities.EnrollmentField.list("order");
      return allFields.filter(
        (field) => field.is_active && (!field.training_id || field.training_id === trainingId)
      );
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
  const activeEnrollmentFields = [...enrollmentFields].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const sectionLabels = {
    pessoais: "Dados Pessoais",
    instituicao: "Instituição",
    enderecos: "Endereços",
    contatos: "Contatos",
  };
  const sectionOrder = ["pessoais", "instituicao", "enderecos", "contatos"];
  const fieldsBySection = sectionOrder.reduce((acc, section) => {
    acc[section] = activeEnrollmentFields.filter((field) => field.section === section);
    return acc;
  }, {});

  const formatFieldValue = (field, value) => {
    if (!value) return value;
    const key = field.field_key?.toLowerCase() || "";
    if (key.includes("cpf")) return formatCpf(value);
    if (key.includes("rg")) return formatRg(value);
    if (
      field.type === "tel" ||
      key.includes("phone") ||
      key.includes("celular") ||
      key.includes("telefone")
    ) {
      return formatPhone(value);
    }
    return value;
  };

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
    activeEnrollmentFields.forEach((field) => {
      const rawValue = formData[field.field_key];
      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

      if (field.required && !value) {
        errors[field.field_key] = "Campo obrigatório.";
        return;
      }

      if (!value) return;

      const lowerKey = field.field_key.toLowerCase();
      const digits = String(value).replace(/\D/g, "");
      if (lowerKey.includes("cpf")) {
        const isValidCpf = (() => {
          if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
          let sum = 0;
          for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
          let check = (sum * 10) % 11;
          if (check === 10) check = 0;
          if (check !== Number(digits[9])) return false;
          sum = 0;
          for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
          check = (sum * 10) % 11;
          if (check === 10) check = 0;
          return check === Number(digits[10]);
        })();
        if (!isValidCpf) {
          errors[field.field_key] = "CPF inválido.";
        }
        return;
      }

      if (lowerKey.includes("rg")) {
        if (digits.length < 5 || digits.length > 12) {
          errors[field.field_key] = "RG inválido.";
        }
        return;
      }

      if (field.type === "email" || lowerKey.includes("email")) {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
        if (!isValidEmail) {
          errors[field.field_key] = "E-mail inválido.";
        }
        return;
      }

      if (
        field.type === "tel" ||
        lowerKey.includes("phone") ||
        lowerKey.includes("celular") ||
        lowerKey.includes("telefone")
      ) {
        if (digits.length < 10 || digits.length > 11) {
          errors[field.field_key] = "Telefone inválido.";
        }
      }
    });

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
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden">
                {training.logo_url ? (
                  <img
                    src={training.logo_url}
                    alt="Logo do treinamento"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <GraduationCap className="h-6 w-6" />
                )}
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
                {activeEnrollmentFields.length === 0 ? (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      Nenhum campo de inscrição foi configurado.
                    </AlertDescription>
                  </Alert>
                ) : (
                  sectionOrder.map((section) => {
                    const sectionFields = fieldsBySection[section];
                    if (sectionFields.length === 0) return null;
                    return (
                      <div key={section} className="space-y-4">
                        <h4 className="font-semibold text-slate-900 text-sm">
                          {sectionLabels[section]}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {sectionFields.map((field) => (
                            <div key={field.id} className="space-y-2">
                              <Label htmlFor={field.field_key}>
                                {field.label} {field.required && "*"}
                              </Label>
                              <Input
                                id={field.field_key}
                                type={field.type}
                                value={formData[field.field_key] || ""}
                                onChange={(e) => {
                                  const nextValue = formatFieldValue(field, e.target.value);
                                  setFormData({ ...formData, [field.field_key]: nextValue });
                                  if (formErrors[field.field_key]) {
                                    setFormErrors((prev) => ({
                                      ...prev,
                                      [field.field_key]: null,
                                    }));
                                  }
                                }}
                                placeholder={field.placeholder}
                                required={field.required}
                              />
                              {formErrors[field.field_key] && (
                                <p className="text-xs text-red-600">
                                  {formErrors[field.field_key]}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}

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