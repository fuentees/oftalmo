import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, User, Users, GraduationCap, FileText, Video } from "lucide-react";
import DataTable from "@/components/common/DataTable";

export default function TrainingDetails({ training, participants }) {
  if (!training) return null;

  const formatDate = (value, pattern = "dd/MM/yyyy") => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, pattern);
  };

  const trainingDates = Array.isArray(training.dates)
    ? training.dates.filter((dateItem) => dateItem?.date)
    : [];

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    agendado: "Agendado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const getLastTrainingDate = () => {
    const dates = [];
    if (Array.isArray(training.dates)) {
      training.dates.forEach((item) => {
        if (item?.date) dates.push(item.date);
      });
    }
    if (training.date) dates.push(training.date);
    if (dates.length === 0) return null;
    const parsedDates = dates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (parsedDates.length === 0) return null;
    return new Date(Math.max(...parsedDates.map((date) => date.getTime())));
  };

  const getEffectiveStatus = () => {
    if (training.status === "concluido" || training.status === "cancelado") {
      return training.status;
    }
    const lastDate = getLastTrainingDate();
    if (!lastDate) return training.status;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return lastDate.getTime() < today.getTime() ? "concluido" : training.status;
  };

  const effectiveStatus = getEffectiveStatus();

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico e Prático",
  };

  const categoryLabels = {
    NR: "NR (Norma Regulamentadora)",
    tecnico: "Técnico",
    comportamental: "Comportamental",
    integracao: "Integração",
    reciclagem: "Reciclagem",
    outros: "Outros",
  };

  const participantColumns = [
    { header: "Nome", accessor: "professional_name", cellClassName: "font-medium" },
    { header: "Matrícula", accessor: "professional_registration" },
    { header: "Setor", accessor: "professional_sector" },
    {
      header: "Presença",
      render: (row) => {
        const colors = {
          presente: "bg-green-100 text-green-700",
          ausente: "bg-red-100 text-red-700",
          justificado: "bg-amber-100 text-amber-700",
        };
        const labels = {
          presente: "Presente",
          ausente: "Ausente",
          justificado: "Justificado",
        };
        return <Badge className={colors[row.attendance]}>{labels[row.attendance]}</Badge>;
      },
    },
    {
      header: "Aprovado",
      render: (row) => (
        <Badge className={row.approved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
          {row.approved ? "Sim" : "Não"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Training Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-50 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">{training.title}</p>
                {training.code && <p className="text-sm text-slate-500">{training.code}</p>}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {trainingDates.length > 0 ? (
                <div>
                  <p className="text-slate-500 font-medium mb-1">Datas e Horários:</p>
                  {trainingDates.map((dateItem, index) => (
                    <div key={index} className="flex items-start gap-2 pl-2 mb-1">
                      <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <div>{formatDate(dateItem.date)}</div>
                        {dateItem.start_time && dateItem.end_time && (
                          <div className="text-slate-500 text-xs">
                            {dateItem.start_time} - {dateItem.end_time}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {training.duration_hours && (
                    <p className="text-slate-500 text-xs pl-6">Carga horária total: {training.duration_hours}h</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>Data a definir</span>
                </div>
              )}
              {training.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span>{training.location}</span>
                </div>
              )}
              {training.online_link && (
                <div className="flex items-start gap-2">
                  <Video className="h-4 w-4 text-blue-600 mt-0.5" />
                  <a 
                    href={training.online_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all text-sm"
                  >
                    Link da Reunião Online
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span>Coordenador: {training.coordinator || "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <Badge className={statusColors[effectiveStatus]}>
                {statusLabels[effectiveStatus]}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo:</span>
              <Badge variant="outline">{typeLabels[training.type]}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Categoria:</span>
              <span>{categoryLabels[training.category]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Participantes:</span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {training.participants_count || 0}
                {training.max_participants && <span className="text-slate-400">/{training.max_participants}</span>}
              </span>
            </div>
            {training.validity_months && (
              <div className="flex justify-between">
                <span className="text-slate-500">Validade:</span>
                <span>{training.validity_months} meses</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {training.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Descrição/Conteúdo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 whitespace-pre-wrap">{training.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Lista de Participantes ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={participantColumns}
            data={participants}
            emptyMessage="Nenhum participante registrado"
          />
        </CardContent>
      </Card>

      {/* Notes */}
      {training.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700">{training.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}