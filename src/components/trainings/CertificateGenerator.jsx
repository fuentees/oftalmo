import jsPDF from "jspdf";
import { format } from "date-fns";

const formatDateSafe = (value, pattern = "dd/MM/yyyy") => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, pattern);
};

export const generateParticipantCertificate = (participant, training) => {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Background/Border
  pdf.setDrawColor(0, 82, 204);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Title
  pdf.setFontSize(32);
  pdf.setFont("helvetica", "bold");
  pdf.text("CERTIFICADO", pageWidth / 2, 40, { align: "center" });

  // Body
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.text("Certificamos que", pageWidth / 2, 60, { align: "center" });

  pdf.setFontSize(24);
  pdf.setFont("helvetica", "bold");
  pdf.text(participant.professional_name, pageWidth / 2, 75, { align: "center" });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  
  const participationText = `participou do treinamento "${training.title}"`;
  pdf.text(participationText, pageWidth / 2, 90, { align: "center" });

  if (training.duration_hours) {
    pdf.text(`com carga horária de ${training.duration_hours} horas,`, pageWidth / 2, 100, { align: "center" });
  }

  const participantDate = Array.isArray(training.dates)
    ? formatDateSafe(training.dates[0]?.date)
    : null;
  if (participantDate) {
    const dateText = `realizado em ${participantDate}.`;
    pdf.text(dateText, pageWidth / 2, 110, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(11);
  const yPos = pageHeight - 40;

  // Instructor
  pdf.line(40, yPos, 100, yPos);
  pdf.text(training.instructor || "", 70, yPos + 5, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("Instrutor", 70, yPos + 10, { align: "center" });

  // Coordinator
  if (training.coordinator) {
    pdf.setFontSize(11);
    pdf.line(pageWidth - 100, yPos, pageWidth - 40, yPos);
    pdf.text(training.coordinator, pageWidth - 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text("Coordenador", pageWidth - 70, yPos + 10, { align: "center" });
  }

  return pdf;
};

export const generateMonitorCertificate = (monitor, training) => {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Background/Border
  pdf.setDrawColor(139, 92, 246);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Title
  pdf.setFontSize(32);
  pdf.setFont("helvetica", "bold");
  pdf.text("CERTIFICADO DE MONITORIA", pageWidth / 2, 40, { align: "center" });

  // Body
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.text("Certificamos que", pageWidth / 2, 60, { align: "center" });

  pdf.setFontSize(24);
  pdf.setFont("helvetica", "bold");
  pdf.text(monitor.name, pageWidth / 2, 75, { align: "center" });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  
  pdf.text(`atuou como MONITOR no treinamento`, pageWidth / 2, 90, { align: "center" });
  
  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.text(`"${training.title}"`, pageWidth / 2, 103, { align: "center" });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  
  if (training.duration_hours) {
    pdf.text(`ministrando aulas com carga horária de ${training.duration_hours} horas,`, pageWidth / 2, 115, { align: "center" });
  }

  const monitorDate = Array.isArray(training.dates)
    ? formatDateSafe(training.dates[0]?.date)
    : null;
  if (monitorDate) {
    const dateText = `realizado em ${monitorDate}.`;
    pdf.text(dateText, pageWidth / 2, 125, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(11);
  const yPos = pageHeight - 40;

  // Instructor
  pdf.line(40, yPos, 100, yPos);
  pdf.text(training.instructor || "", 70, yPos + 5, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("Instrutor Responsável", 70, yPos + 10, { align: "center" });

  // Coordinator
  if (training.coordinator) {
    pdf.setFontSize(11);
    pdf.line(pageWidth - 100, yPos, pageWidth - 40, yPos);
    pdf.text(training.coordinator, pageWidth - 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text("Coordenador", pageWidth - 70, yPos + 10, { align: "center" });
  }

  return pdf;
};