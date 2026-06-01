import React, { useState, useEffect } from "react";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import {
  CheckCircle2, XCircle, Loader2, ClipboardCheck, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LOGO_URL = "/logo.svg";

function calculateScore(questions, answers) {
  let score = 0, maxScore = 0;
  questions.forEach((q) => {
    const pts = Number(q.points) || 1;
    if (q.type !== "essay") maxScore += pts;
    const ans = answers[q.id];
    if (!ans) return;
    if (q.type === "true_false" && ans === q.correct_answer) score += pts;
    if (q.type === "multiple_choice") {
      const correct = (q.options || []).find((o) => o.is_correct);
      if (correct && ans === correct.id) score += pts;
    }
  });
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return { score, maxScore, percentage };
}

export default function PublicExam() {
  const examId = new URLSearchParams(window.location.search).get("exam");

  const [step, setStep] = useState("loading"); // loading | error | ident | exam | submitting | result
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [participant, setParticipant] = useState({ name: "", cpf: "" });
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!examId) { setStep("error"); setErrorMsg("Link inválido — nenhuma prova especificada."); return; }
    (async () => {
      try {
        const examData = await dataClient.entities.Exam.filter({ id: examId });
        const examObj = Array.isArray(examData) ? examData[0] : examData;
        if (!examObj) { setStep("error"); setErrorMsg("Prova não encontrada."); return; }
        if (!examObj.is_active) { setStep("error"); setErrorMsg("Esta prova não está disponível no momento."); return; }
        setExam(examObj);
        const qs = await dataClient.entities.ExamQuestion.filter({ exam_id: examId }, "ordem");
        setQuestions(Array.isArray(qs) ? qs : []);
        setStep("ident");
      } catch (err) {
        setStep("error");
        setErrorMsg(err?.message || "Erro ao carregar a prova.");
      }
    })();
  }, [examId]);

  const handleStartExam = (e) => {
    e.preventDefault();
    if (!participant.name.trim()) return;
    setStep("exam");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setAnswer = (qId, value) =>
    setAnswers((prev) => ({ ...prev, [qId]: value }));

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;
  const totalRequired = questions.filter((q) => q.type !== "essay").length;

  const handleSubmit = async () => {
    setStep("submitting");
    try {
      const { score, maxScore, percentage } = calculateScore(questions, answers);
      const passed = percentage >= Number(exam.passing_score || 60);
      await dataClient.entities.ExamSubmission.create({
        exam_id: exam.id,
        exam_title: exam.title,
        participant_name: participant.name.trim(),
        participant_cpf: participant.cpf.trim() || null,
        answers,
        score,
        max_score: maxScore,
        percentage: Math.round(percentage * 100) / 100,
        passed,
      });
      setResult({ score, maxScore, percentage, passed });
      setStep("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStep("exam");
      alert("Erro ao enviar prova: " + (err?.message || "tente novamente."));
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  const headerStyle = {
    background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%)",
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          <p>Carregando prova...</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center border-red-200">
          <CardContent className="py-10">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-700 mb-2">Prova indisponível</h2>
            <p className="text-slate-500">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────────
  if (step === "result" && result) {
    const pct = Math.round(result.percentage);
    const passing = Number(exam?.passing_score || 60);
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="py-8 text-white text-center" style={headerStyle}>
          <img src={LOGO_URL} alt="logo" className="h-10 mx-auto mb-3 opacity-90" />
          <p className="text-sm opacity-80">{exam?.title}</p>
        </div>
        <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
          <Card className={`border-2 text-center ${result.passed ? "border-green-400" : "border-red-300"}`}>
            <CardContent className="py-10">
              {result.passed
                ? <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                : <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />}
              <h2 className={`text-3xl font-black mb-1 ${result.passed ? "text-green-600" : "text-red-500"}`}>
                {result.passed ? "APROVADO" : "REPROVADO"}
              </h2>
              <p className="text-slate-500 mb-6">Olá, {participant.name}</p>
              <div className="text-5xl font-black mb-2 text-slate-800">{pct}%</div>
              <p className="text-sm text-slate-400">
                {result.score} de {result.maxScore} pontos · mínimo: {passing}%
              </p>
            </CardContent>
          </Card>

          {/* Per-question feedback */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-700">Gabarito</h3>
            {questions.map((q, i) => {
              if (q.type === "essay") return (
                <Card key={q.id} className="border-slate-200">
                  <CardContent className="py-3 px-4">
                    <p className="text-sm font-medium text-slate-700">Q{i+1}. {q.text}</p>
                    <p className="text-xs text-purple-600 mt-1">Dissertativa — correção manual</p>
                    {answers[q.id] && <p className="text-xs text-slate-500 mt-1 bg-slate-50 p-2 rounded">Sua resposta: {answers[q.id]}</p>}
                  </CardContent>
                </Card>
              );
              const userAnswer = answers[q.id];
              let isCorrect = false;
              let correctLabel = "";
              if (q.type === "true_false") {
                isCorrect = userAnswer === q.correct_answer;
                correctLabel = `Resposta correta: ${q.correct_answer}`;
              } else if (q.type === "multiple_choice") {
                const correctOpt = (q.options || []).find((o) => o.is_correct);
                isCorrect = userAnswer === correctOpt?.id;
                correctLabel = correctOpt ? `Correta: ${correctOpt.text}` : "";
              }
              return (
                <Card key={q.id} className={`border ${isCorrect ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-2">
                      {isCorrect
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">Q{i+1}. {q.text}</p>
                        {q.image_url && <img src={q.image_url} alt="" className="h-20 rounded mt-1 mb-1" />}
                        {!isCorrect && <p className="text-xs text-red-500 mt-1">{correctLabel}</p>}
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${isCorrect ? "text-green-600" : "text-red-500"}`}>
                        {isCorrect ? `+${q.points}` : "0"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Identification step ───────────────────────────────────────────────────────
  if (step === "ident") {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="py-8 text-white text-center" style={headerStyle}>
          <img src={LOGO_URL} alt="logo" className="h-10 mx-auto mb-3 opacity-90" />
          <h1 className="text-2xl font-bold">{exam?.title}</h1>
          {exam?.training_title && <p className="text-sm opacity-80 mt-1">{exam.training_title}</p>}
        </div>
        <div className="max-w-md mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Identificação</CardTitle>
            </CardHeader>
            <CardContent>
              {exam?.description && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
                  {exam.description}
                </div>
              )}
              <form onSubmit={handleStartExam} className="space-y-4">
                <div>
                  <Label>Nome completo *</Label>
                  <Input className="mt-1" value={participant.name} required
                    onChange={(e) => setParticipant((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Seu nome completo" />
                </div>
                <div>
                  <Label>CPF (opcional)</Label>
                  <Input className="mt-1" value={participant.cpf}
                    onChange={(e) => setParticipant((p) => ({ ...p, cpf: e.target.value }))}
                    placeholder="000.000.000-00" />
                </div>
                <div className="pt-2 text-sm text-slate-500 space-y-1">
                  <p>• {questions.length} questão{questions.length !== 1 ? "ões" : ""}</p>
                  <p>• Nota mínima para aprovação: {exam?.passing_score}%</p>
                </div>
                <Button type="submit" className="w-full text-white" style={{ background: "hsl(var(--primary))" }}>
                  Iniciar Prova
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Exam questions ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="py-6 text-white" style={headerStyle}>
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold">{exam?.title}</h1>
            <p className="text-xs opacity-80">{participant.name}</p>
          </div>
          <div className="text-right text-sm opacity-90">
            <p>{answeredCount}/{questions.length} respondidas</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {questions.map((q, i) => (
          <Card key={q.id} className={`border-slate-200 ${answers[q.id] !== undefined && answers[q.id] !== "" ? "border-l-4 border-l-green-400" : ""}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-sm font-bold text-slate-400 mt-0.5">Q{i+1}</span>
                <p className="text-sm font-medium text-slate-800">{q.text}</p>
                <span className="shrink-0 text-xs text-slate-400 ml-auto">{q.points}pt{q.points !== 1 ? "s" : ""}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {q.image_url && (
                <img src={q.image_url} alt="imagem da questão"
                  className="max-h-52 rounded-lg border border-slate-200 object-contain" />
              )}

              {q.type === "true_false" && (
                <div className="flex gap-3">
                  {["V", "F"].map((val) => (
                    <button key={val} onClick={() => setAnswer(q.id, val)}
                      className={`flex-1 py-3 rounded-xl font-bold text-lg border-2 transition-all
                        ${answers[q.id] === val
                          ? val === "V" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 text-slate-400 hover:border-slate-400"}`}>
                      {val}
                    </button>
                  ))}
                </div>
              )}

              {q.type === "multiple_choice" && (
                <div className="space-y-2">
                  {(q.options || []).map((opt, oi) => (
                    <button key={opt.id} onClick={() => setAnswer(q.id, opt.id)}
                      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-sm
                        ${answers[q.id] === opt.id
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <span className={`shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs font-bold
                        ${answers[q.id] === opt.id ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 text-slate-400"}`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt.text}
                    </button>
                  ))}
                </div>
              )}

              {q.type === "essay" && (
                <Textarea rows={4} placeholder="Escreva sua resposta aqui..."
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="text-sm resize-none" />
              )}
            </CardContent>
          </Card>
        ))}

        {/* Submit */}
        <Card className="border-slate-200 sticky bottom-4 shadow-lg">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              {answeredCount} de {questions.length} questões respondidas
              {answeredCount < totalRequired && (
                <span className="text-amber-600 ml-2">({totalRequired - answeredCount} obrigatória{totalRequired - answeredCount !== 1 ? "s" : ""} pendente{totalRequired - answeredCount !== 1 ? "s" : ""})</span>
              )}
            </div>
            <Button onClick={handleSubmit} disabled={step === "submitting" || answeredCount < totalRequired}
              className="text-white shrink-0" style={{ background: "hsl(var(--primary))" }}>
              {step === "submitting" ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</> : "Enviar Prova"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
