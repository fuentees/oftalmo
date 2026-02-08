import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award, Download, ExternalLink, Search, FileText, Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CertificatesPanel({ professional }) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["certificates", professional.id],
    queryFn: async () => {
      const participants = await base44.entities.TrainingParticipant.filter({ 
        professional_id: professional.id,
        certificate_issued: true
      }, "-certificate_sent_date");
      return participants;
    },
  });

  const filteredCertificates = certificates.filter(cert => 
    cert.training_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getValidityStatus = (cert) => {
    if (!cert.validity_date) return { label: "Sem validade", color: "bg-slate-100 text-slate-700" };
    
    const validityDate = new Date(cert.validity_date);
    const now = new Date();
    const daysUntilExpiry = Math.floor((validityDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { label: "Vencido", color: "bg-red-100 text-red-700", icon: AlertCircle };
    } else if (daysUntilExpiry < 30) {
      return { label: `Vence em ${daysUntilExpiry} dias`, color: "bg-yellow-100 text-yellow-700", icon: AlertCircle };
    }
    return { label: "Válido", color: "bg-green-100 text-green-700" };
  };

  const categorizedCerts = {
    valid: filteredCertificates.filter(c => {
      if (!c.validity_date) return false;
      return new Date(c.validity_date) > new Date();
    }),
    expiring: filteredCertificates.filter(c => {
      if (!c.validity_date) return false;
      const days = Math.floor((new Date(c.validity_date) - new Date()) / (1000 * 60 * 60 * 24));
      return days > 0 && days < 30;
    }),
    expired: filteredCertificates.filter(c => {
      if (!c.validity_date) return false;
      return new Date(c.validity_date) < new Date();
    }),
    noExpiry: filteredCertificates.filter(c => !c.validity_date)
  };

  if (isLoading) {
    return <div className="text-center py-8">Carregando certificados...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{categorizedCerts.valid.length}</div>
              <div className="text-sm text-green-700 mt-1">Válidos</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">{categorizedCerts.expiring.length}</div>
              <div className="text-sm text-yellow-700 mt-1">A Vencer</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{categorizedCerts.expired.length}</div>
              <div className="text-sm text-red-700 mt-1">Vencidos</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-600">{certificates.length}</div>
              <div className="text-sm text-slate-700 mt-1">Total</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar certificado..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lista de certificados */}
      {filteredCertificates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              {searchTerm ? "Nenhum certificado encontrado" : "Nenhum certificado emitido ainda"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredCertificates.map((cert) => {
            const status = getValidityStatus(cert);
            const StatusIcon = status.icon;
            
            return (
              <Card key={cert.id} className="hover:shadow-lg transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Award className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2">
                        {cert.training_title}
                      </h3>
                      
                      <div className="space-y-2 text-sm text-slate-600">
                        {cert.certificate_sent_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Emitido: {format(new Date(cert.certificate_sent_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        )}
                        
                        {cert.validity_date && (
                          <div className="flex items-center gap-2">
                            {StatusIcon && <StatusIcon className="h-3 w-3" />}
                            <span>
                              Validade: {format(new Date(cert.validity_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <Badge className={status.color}>
                          {status.label}
                        </Badge>
                      </div>

                      {cert.certificate_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(cert.certificate_url, "_blank")}
                          className="w-full mt-3"
                        >
                          <ExternalLink className="h-3 w-3 mr-2" />
                          Abrir Certificado
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}