import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, FileText, User, Calendar, Activity } from "lucide-react";
import QueryError from "@/components/common/QueryError";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function AuditLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailsLog, setDetailsLog] = useState(null);

  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => dataClient.entities.AuditLog.list("-created_date", 500),
  });

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesEntity = entityFilter === "all" || log.entity_type === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const getActionBadge = (action) => {
    const badges = {
      criar: { label: "Criado", color: "bg-green-100 text-green-700" },
      editar: { label: "Editado", color: "bg-blue-100 text-blue-700" },
      excluir: { label: "Excluído", color: "bg-red-100 text-red-700" },
      visualizar: { label: "Visualizado", color: "bg-slate-100 text-slate-700" },
    };
    const badge = badges[action] || { label: action, color: "bg-slate-100 text-slate-700" };
    return <Badge className={badge.color}>{badge.label}</Badge>;
  };

  const entityTypes = [...new Set(logs.map(l => l.entity_type))].filter(Boolean);
  const actions = [...new Set(logs.map(l => l.action))].filter(Boolean);

  const stats = {
    total: logs.length,
    today: logs.filter(l => {
      const logDate = new Date(l.created_date);
      const today = new Date();
      return logDate.toDateString() === today.toDateString();
    }).length,
    users: [...new Set(logs.map(l => l.user_email))].length,
  };

  const columns = [
    {
      header: "Data/Hora",
      accessor: "created_date",
      sortable: true,
      render: (log) => (
        <div className="text-sm">
          <div className="font-medium">
            {format(new Date(log.created_date), "dd/MM/yyyy", { locale: ptBR })}
          </div>
          <div className="text-slate-500">
            {format(new Date(log.created_date), "HH:mm:ss", { locale: ptBR })}
          </div>
        </div>
      ),
    },
    {
      header: "Usuário",
      accessor: "user_name",
      sortable: true,
      render: (log) => (
        <div className="text-sm">
          <div className="font-medium">{log.user_name || "N/A"}</div>
          <div className="text-slate-500">{log.user_email}</div>
        </div>
      ),
    },
    {
      header: "Ação",
      accessor: "action",
      sortable: true,
      render: (log) => getActionBadge(log.action),
    },
    {
      header: "Entidade",
      accessor: "entity_type",
      sortable: true,
      render: (log) => (
        <div className="text-sm">
          <div className="font-medium">{log.entity_type}</div>
          {log.entity_name && (
            <div className="text-slate-500 line-clamp-1">{log.entity_name}</div>
          )}
        </div>
      ),
    },
    {
      header: "Detalhes",
      render: (log) => (
        log.changes && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailsLog(log)}
          >
            <FileText className="h-4 w-4" />
          </Button>
        )
      ),
    },
  ];

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Logs de Auditoria" subtitle="Histórico de ações no sistema" />
        <QueryError onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs de Auditoria"
        subtitle="Histórico de ações no sistema"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center shrink-0">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total de Ações</div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-50 ring-1 ring-green-100 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.today}</div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Ações Hoje</div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 ring-1 ring-purple-100 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.users}</div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Usuários Ativos</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar por entidade, usuário ou e-mail..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="pl-10 bg-white"
          />
        </div>
        <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
          <SelectTrigger className="w-full sm:w-44 bg-white">
            <SelectValue placeholder="Todas as ações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {actions.map(action => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={handleFilterChange(setEntityFilter)}>
          <SelectTrigger className="w-full sm:w-52 bg-white">
            <SelectValue placeholder="Todas as entidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as entidades</SelectItem>
            {entityTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <DataTable
        columns={columns}
        data={pagedLogs}
        isLoading={isLoading}
        emptyMessage="Nenhum log encontrado"
      />

      {/* Paginação */}
      {filteredLogs.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Linhas por página:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredLogs.length)} de{" "}
              {filteredLogs.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="px-3 text-sm text-slate-600">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detailsLog} onOpenChange={(open) => !open && setDetailsLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes da ação — {detailsLog?.entity_type} · {detailsLog?.entity_name}
            </DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-slate-50 rounded-md p-4 overflow-x-auto whitespace-pre-wrap break-all border border-slate-200">
            {JSON.stringify(detailsLog?.changes, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}