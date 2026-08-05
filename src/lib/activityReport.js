// Vocabulário fixo usado no Relatório de Atividades do CVE (Centro de
// Vigilância Epidemiológica) — compartilhado entre o formulário de
// treinamento, o formulário de evento da Agenda e a exportação da planilha
// em Reports.jsx, para as três telas nunca divergirem sobre os valores
// aceitos.

// As 4 categorias de produtividade do Prêmio Incentivo.
export const ACTION_NATURE_OPTIONS = [
  "Produção Técnica/Científica",
  "Supervisão, Assessoria e Consultoria",
  "Treinamento/Capacitação/Formação/Reuniões",
  "Sistema de Informação/Informatização",
];

// Exemplos de formato de evento citados na orientação oficial.
export const EVENT_FORMAT_OPTIONS = [
  "Congresso",
  "Seminário",
  "Oficina",
  "Reunião Técnica",
  "Curso",
  "Palestra",
  "Webinário",
  "Outro",
];

export const YES_NO_OPTIONS = ["Sim", "Não"];

// O Relatório de Atividades do CVE é compilado por trimestre (jan-mar,
// abr-jun, jul-set, out-dez). Isso descreve, pra cada mês de fechamento, o
// rótulo do trimestre e os meses que ele cobre — usado pra alertar antes do
// fechamento que os dados ainda precisam ser lançados no sistema oficial.
const ACTIVITY_REPORT_QUARTERS = [
  { closingMonth: 3, label: "1º trimestre", monthsLabel: "Janeiro, Fevereiro e Março" },
  { closingMonth: 6, label: "2º trimestre", monthsLabel: "Abril, Maio e Junho" },
  { closingMonth: 9, label: "3º trimestre", monthsLabel: "Julho, Agosto e Setembro" },
  { closingMonth: 12, label: "4º trimestre", monthsLabel: "Outubro, Novembro e Dezembro" },
];

export const ACTIVITY_REPORT_ALERT_WINDOW_DAYS = 10;

/**
 * Retorna os dados do alerta de fechamento de trimestre quando a data
 * informada estiver dentro da janela de aviso (últimos N dias do mês que
 * fecha o trimestre); caso contrário retorna null.
 */
export function getActivityReportQuarterAlert(date = new Date()) {
  const month = date.getMonth() + 1;
  const quarter = ACTIVITY_REPORT_QUARTERS.find((q) => q.closingMonth === month);
  if (!quarter) return null;

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - date.getDate();
  if (daysRemaining > ACTIVITY_REPORT_ALERT_WINDOW_DAYS) return null;

  return {
    quarterLabel: quarter.label,
    monthsLabel: quarter.monthsLabel,
    daysRemaining,
    year: date.getFullYear(),
  };
}
