import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Search, X, GraduationCap, User, Package, Calendar } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => base44.entities.Training.list(),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => base44.entities.Professional.list(),
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => base44.entities.Material.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list(),
  });

  const results = query.length > 0 ? {
    trainings: trainings.filter(t => 
      t.title?.toLowerCase().includes(query.toLowerCase()) ||
      t.code?.toLowerCase().includes(query.toLowerCase()) ||
      t.instructor?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5),
    professionals: professionals.filter(p => 
      p.name?.toLowerCase().includes(query.toLowerCase()) ||
      p.registration?.toLowerCase().includes(query.toLowerCase()) ||
      p.sector?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5),
    materials: materials.filter(m => 
      m.name?.toLowerCase().includes(query.toLowerCase()) ||
      m.code?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5),
    events: events.filter(e => 
      e.title?.toLowerCase().includes(query.toLowerCase()) ||
      e.location?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5),
  } : { trainings: [], professionals: [], materials: [], events: [] };

  const totalResults = results.trainings.length + results.professionals.length + 
                       results.materials.length + results.events.length;

  const handleSelect = (type, item) => {
    onClose();
    setQuery("");
    
    switch(type) {
      case 'training':
        navigate(createPageUrl('Trainings'));
        break;
      case 'professional':
        navigate(createPageUrl('Professionals'));
        break;
      case 'material':
        navigate(createPageUrl('Stock'));
        break;
      case 'event':
        navigate(createPageUrl('Schedule'));
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0">
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 text-slate-400 mr-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar treinamentos, profissionais, materiais..."
            className="border-0 focus-visible:ring-0 p-0"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery("")} className="ml-2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto p-4">
          {query.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Digite para buscar em todo o sistema
            </p>
          ) : totalResults === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Nenhum resultado encontrado para "{query}"
            </p>
          ) : (
            <div className="space-y-4">
              {results.trainings.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">TREINAMENTOS</h3>
                  {results.trainings.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect('training', item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg text-left"
                    >
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <GraduationCap className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.instructor}</p>
                      </div>
                      <Badge variant="outline">{item.status}</Badge>
                    </button>
                  ))}
                </div>
              )}

              {results.professionals.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">PROFISSIONAIS</h3>
                  {results.professionals.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect('professional', item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg text-left"
                    >
                      <div className="p-2 bg-green-100 rounded-lg">
                        <User className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.sector}</p>
                      </div>
                      <Badge variant="outline">{item.registration}</Badge>
                    </button>
                  ))}
                </div>
              )}

              {results.materials.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">MATERIAIS</h3>
                  {results.materials.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect('material', item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">Estoque: {item.current_stock} {item.unit}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.events.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">EVENTOS</h3>
                  {results.events.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect('event', item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg text-left"
                    >
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Calendar className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.location}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}