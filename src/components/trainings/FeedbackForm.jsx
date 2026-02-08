import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function FeedbackForm({ training, participant, onClose }) {
  const [formData, setFormData] = useState({
    rating: 0,
    content_quality: 0,
    instructor_rating: 0,
    comments: "",
    would_recommend: false,
  });

  const queryClient = useQueryClient();

  const submitFeedback = useMutation({
    mutationFn: (data) => base44.entities.TrainingFeedback.create({
      training_id: training.id,
      training_title: training.title,
      participant_id: participant.id,
      participant_name: participant.professional_name,
      ...data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingFeedback"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submitFeedback.mutate(formData);
  };

  const StarRating = ({ value, onChange, label }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="focus:outline-none"
          >
            <Star
              className={`h-8 w-8 ${
                star <= value
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-slate-300"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StarRating
        label="Avaliação Geral"
        value={formData.rating}
        onChange={(value) => setFormData({ ...formData, rating: value })}
      />

      <StarRating
        label="Qualidade do Conteúdo"
        value={formData.content_quality}
        onChange={(value) => setFormData({ ...formData, content_quality: value })}
      />

      <StarRating
        label="Avaliação do Instrutor"
        value={formData.instructor_rating}
        onChange={(value) => setFormData({ ...formData, instructor_rating: value })}
      />

      <div>
        <Label>Comentários e Sugestões</Label>
        <Textarea
          value={formData.comments}
          onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
          rows={4}
          placeholder="Compartilhe sua experiência..."
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="recommend"
          checked={formData.would_recommend}
          onCheckedChange={(checked) => 
            setFormData({ ...formData, would_recommend: checked })
          }
        />
        <Label htmlFor="recommend" className="font-normal">
          Eu recomendaria este treinamento
        </Label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitFeedback.isPending || formData.rating === 0}>
          Enviar Avaliação
        </Button>
      </div>
    </form>
  );
}