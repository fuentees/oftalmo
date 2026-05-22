import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";

export default function ShortEnrollment() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) { setNotFound(true); return; }
    dataClient.entities.Training.filter({ short_code: code })
      .then((trainings) => {
        const id = trainings?.[0]?.id;
        if (id) {
          navigate(`/i/${id}`, { replace: true });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true));
  }, [code, navigate]);

  if (notFound) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-slate-500">Link inválido ou expirado.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
