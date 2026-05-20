import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns the user before navigating away or closing the tab when there are unsaved changes.
 * @param {boolean} isDirty - Whether the form has unsaved changes.
 * @param {string} [message] - Custom message shown in the browser prompt.
 */
export function useUnsavedChanges(
  isDirty,
  message = "Você tem alterações não salvas. Deseja sair mesmo assim?"
) {
  // Block in-app navigation via React Router
  useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Block browser tab close / hard navigation
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
