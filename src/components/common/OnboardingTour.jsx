import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "onboarding-tour-completed-v1";

const STEPS = [
  {
    title: "Bem-vindo ao Sistema",
    description:
      "Este é o painel principal. Aqui você encontra um resumo de tudo: estoque, treinamentos próximos, cobertura por município e eventos da agenda.",
    highlight: null,
    icon: "🏠",
  },
  {
    title: "Busca Global",
    description:
      "Use Ctrl+K (ou ⌘K no Mac) para buscar qualquer participante, treinamento ou material em segundos, sem navegar por menus.",
    highlight: null,
    icon: "🔍",
  },
  {
    title: "Notificações",
    description:
      "O sino no topo da tela mostra alertas automáticos: estoque crítico, treinamentos próximos, inscrições pendentes e validades vencendo.",
    highlight: null,
    icon: "🔔",
  },
  {
    title: "Treinamentos",
    description:
      "Cada treinamento tem abas dedicadas: Inscrições, Presença, Certificados, Lista de Espera e Lembretes. Use 'Comparar Turmas' para analisar resultados entre edições.",
    highlight: null,
    icon: "🎓",
  },
  {
    title: "Participantes",
    description:
      "O perfil de cada participante mostra uma linha do tempo de todos os treinamentos, estatísticas e notas internas — visíveis apenas para a equipe.",
    highlight: null,
    icon: "👤",
  },
  {
    title: "Tudo pronto!",
    description:
      "Você já conhece o essencial. Explore as outras páginas: Estoque, Agenda, Solicitações e Relatórios. Qualquer dúvida, use a busca global para navegar rapidamente.",
    highlight: null,
    icon: "🚀",
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(TOUR_KEY);
      if (!done) setVisible(true);
    } catch {}
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(TOUR_KEY, "true");
    } catch {}
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Card centralizado */}
          <motion.div
            className="fixed inset-0 z-[81] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              key={step}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-5"
              initial={{ scale: 0.95, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: -8, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                    {current.icon}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                      Passo {step + 1} de {STEPS.length}
                    </p>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {current.title}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={dismiss}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-0.5 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Conteúdo */}
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {current.description}
              </p>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5 justify-center">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`rounded-full transition-all ${
                      i === step
                        ? "w-5 h-2 bg-primary"
                        : "w-2 h-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300"
                    }`}
                  />
                ))}
              </div>

              {/* Botões */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Pular tour
                </Button>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button variant="outline" size="sm" onClick={prev} className="gap-1">
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Anterior
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={next}
                    className="gap-1 text-white"
                    style={{ background: "hsl(var(--primary))" }}
                  >
                    {step < STEPS.length - 1 ? (
                      <>
                        Próximo
                        <ChevronRight className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Começar!
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
