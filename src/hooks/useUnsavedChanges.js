import { useEffect } from "react";

export function useUnsavedChanges(
  isDirty,
  message = "Você tem alterações não salvas. Deseja sair mesmo assim?"
) {
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = message;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, message]);
}
