import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { UserCheck, UserX, Search, Calendar, Link as LinkIcon, Copy, CheckCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function AttendanceControl({ training, participants, onClose }) {
  const [search, setSearch] = useState("");
  const trainingDates = Array.isArray(training?.dates)
    ? training.dates.filter((dateItem) => dateItem?.date)
    : [];
  const sortedTrainingDates = [...trainingDates].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const [selectedDate, setSelectedDate] = useState(
    trainingDates[0]?.date || null
  );
  const [generatedLink, setGeneratedLink] = useState(null);
  const queryClient = useQueryClient();

  const formatDate = (value, pattern = "dd/MM/yyyy") => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, pattern);
  };

  const getStatusLabel = (status) => {
    if (status === "presente") return "Presente";
    if (status === "justificado") return "Justificado";
    if (status === "ausente") return "Ausente";
    return "-";
  };

  const updateAttendance = useMutation({
    mutationFn: async (/** @type {{ participantId: any; date: any; status: any }} */ payload) => {
      const { participantId, date, status } = payload;
      const participant = participants.find(p => p.id === participantId);
      const records = participant.attendance_records || [];
      
      const existingIndex = records.findIndex(r => r.date === date);
      const updatedRecords = [...records];
      
      if (existingIndex >= 0) {
        updatedRecords[existingIndex] = {
          date,
          status,
          check_in_time: format(new Date(), "HH:mm")
        };
      } else {
        updatedRecords.push({
          date,
          status,
          check_in_time: format(new Date(), "HH:mm")
        });
      }

      const totalDates = training.dates?.length || 1;
      const presentCount = updatedRecords.filter(r => r.status === "presente").length;
      const percentage = Math.round((presentCount / totalDates) * 100);

      return dataClient.entities.TrainingParticipant.update(participantId, {
        attendance_records: updatedRecords,
        attendance_percentage: percentage,
        approved: percentage >= 75
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      toast.success("Presença atualizada");
    },
  });

  const generateLink = useMutation({
    mutationFn: async () => {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 6);

      await dataClient.entities.AttendanceLink.create({
        training_id: training.id,
        training_title: training.title,
        date: selectedDate,
        token,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        check_ins_count: 0
      });

      return `${window.location.origin}/CheckIn?token=${token}`;
    },
    onSuccess: (link) => {
      setGeneratedLink(link);
      toast.success("Link gerado!");
    },
  });

  const copyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success("Link copiado!");
    }
  };

  const filteredParticipants = participants.filter(
    p =>
      p.enrollment_status !== "cancelado" &&
      (p.professional_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.professional_registration?.toLowerCase().includes(search.toLowerCase()))
  );

  const getAttendanceForDate = (participant, date) => {
    const records = participant.attendance_records || [];
    return records.find(r => r.date === date);
  };

  const exportDailyAttendance = () => {
    if (sortedTrainingDates.length === 0) return;
    const headers = [
      "Nome",
      "RG",
      "E-mail",
      ...sortedTrainingDates.map((item) => formatDate(item.date)),
    ];

    const escapeValue = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = filteredParticipants.map((participant) => {
      const base = [
        participant.professional_name || "",
        participant.professional_rg || "",
        participant.professional_email || "",
      ];
      const attendance = sortedTrainingDates.map((item) => {
        const record = getAttendanceForDate(participant, item.date);
        return getStatusLabel(record?.status);
      });
      return [...base, ...attendance];
    });

    const csv = [
      headers.map(escapeValue).join(";"),
      ...rows.map((row) => row.map(escapeValue).join(";")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `frequencia_${training.title || "treinamento"}.csv`;
    link.click();
  };

  const stats = {
    total: filteredParticipants.length,
    present: filteredParticipants.filter(p => {
      const record = getAttendanceForDate(p, selectedDate);
      return record?.status === "presente";
    }).length,
    absent: filteredParticipants.filter(p => {
      const record = getAttendanceForDate(p, selectedDate);
      return record?.status === "ausente";
    }).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{training.title}</h3>
          {trainingDates.length > 0 && (
            <p className="text-sm text-slate-500">
              {trainingDates.length} data(s) de treinamento
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="attendance">Presença</TabsTrigger>
          <TabsTrigger value="daily">Frequência por dia</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4 mt-4">
          {/* Date Selection */}
          {trainingDates.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Selecione a Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
                  {sortedTrainingDates.map((dateItem, index) => (
                <Button
                  key={index}
                  variant={selectedDate === dateItem.date ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedDate(dateItem.date);
                    setGeneratedLink(null);
                  }}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {formatDate(dateItem.date)}
                  {dateItem.start_time && ` - ${dateItem.start_time}`}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
          )}

      {/* Link Generation */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-blue-600" />
            Link de Check-in - {selectedDate && format(new Date(selectedDate), "dd/MM/yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!generatedLink ? (
            <Button 
              onClick={() => generateLink.mutate()}
              disabled={generateLink.isPending}
              className="w-full"
            >
              Gerar Link de Check-in
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-white rounded border">
                <input 
                  value={generatedLink} 
                  readOnly 
                  className="flex-1 text-sm bg-transparent outline-none"
                />
                <Button size="sm" onClick={copyLink}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-slate-600">
                ⚠️ Compartilhe este link no chat do Zoom/Teams. Expira em 6 horas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.present}</p>
              <p className="text-xs text-slate-500">Presentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
              <p className="text-xs text-slate-500">Ausentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome ou matrícula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Participants Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold">Nome</TableHead>
              <TableHead className="font-semibold">Matrícula</TableHead>
              <TableHead className="font-semibold">Check-in</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">% Presença</TableHead>
              <TableHead className="font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredParticipants.map((participant) => {
              const record = getAttendanceForDate(participant, selectedDate);
              const status = record?.status || "ausente";
              
              return (
                <TableRow key={participant.id}>
                  <TableCell className="font-medium">
                    {participant.professional_name}
                  </TableCell>
                  <TableCell>{participant.professional_registration}</TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {record?.check_in_time || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        status === "presente"
                          ? "bg-green-100 text-green-700"
                          : status === "justificado"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }
                    >
                      {status === "presente" ? "Presente" : status === "justificado" ? "Justificado" : "Ausente"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {participant.attendance_percentage || 0}%
                      </span>
                      {participant.approved && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={status === "presente" ? "default" : "outline"}
                        onClick={() =>
                          updateAttendance.mutate({
                            participantId: participant.id,
                            date: selectedDate,
                            status: "presente",
                          })
                        }
                        disabled={updateAttendance.isPending}
                      >
                        <UserCheck className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={status === "ausente" ? "default" : "outline"}
                        onClick={() =>
                          updateAttendance.mutate({
                            participantId: participant.id,
                            date: selectedDate,
                            status: "ausente",
                          })
                        }
                        disabled={updateAttendance.isPending}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TabsContent>

    <TabsContent value="daily" className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-slate-700">
            Frequência por dia
          </h4>
          <p className="text-xs text-slate-500">
            Nome, RG e e-mail com presença por data.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={exportDailyAttendance}
          disabled={sortedTrainingDates.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Planilha
        </Button>
      </div>

      {sortedTrainingDates.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-slate-500">
          Nenhuma data cadastrada para este treinamento.
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold">Nome</TableHead>
                <TableHead className="font-semibold">RG</TableHead>
                <TableHead className="font-semibold">E-mail</TableHead>
                {sortedTrainingDates.map((item, index) => (
                  <TableHead key={`${item.date}-${index}`} className="font-semibold">
                    {formatDate(item.date)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredParticipants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3 + sortedTrainingDates.length} className="text-center py-8 text-slate-500">
                    Nenhum participante encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredParticipants.map((participant) => (
                  <TableRow key={`daily-${participant.id}`}>
                    <TableCell className="font-medium">
                      {participant.professional_name}
                    </TableCell>
                    <TableCell>{participant.professional_rg || "-"}</TableCell>
                    <TableCell>{participant.professional_email || "-"}</TableCell>
                    {sortedTrainingDates.map((item, index) => {
                      const record = getAttendanceForDate(participant, item.date);
                      return (
                        <TableCell key={`${participant.id}-${index}`}>
                          {getStatusLabel(record?.status)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </TabsContent>
  </Tabs>
</div>
  );
}