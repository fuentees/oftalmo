import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Palette, Check } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataExport from "@/components/settings/DataExport";

export default function Settings() {
  const [selectedColor, setSelectedColor] = useState("blue");

  useEffect(() => {
    const savedColor = localStorage.getItem("theme-color") || "blue";
    setSelectedColor(savedColor);
    applyColor(savedColor);
  }, []);

  const colors = [
    { name: "Azul", value: "blue", classes: "bg-blue-900 border-blue-800 bg-blue-500 text-blue-100 hover:bg-blue-800 bg-blue-600 hover:bg-blue-700" },
    { name: "Verde", value: "green", classes: "bg-green-900 border-green-800 bg-green-500 text-green-100 hover:bg-green-800 bg-green-600 hover:bg-green-700" },
    { name: "Roxo", value: "purple", classes: "bg-purple-900 border-purple-800 bg-purple-500 text-purple-100 hover:bg-purple-800 bg-purple-600 hover:bg-purple-700" },
    { name: "Laranja", value: "orange", classes: "bg-orange-900 border-orange-800 bg-orange-500 text-orange-100 hover:bg-orange-800 bg-orange-600 hover:bg-orange-700" },
    { name: "Rosa", value: "pink", classes: "bg-pink-900 border-pink-800 bg-pink-500 text-pink-100 hover:bg-pink-800 bg-pink-600 hover:bg-pink-700" },
    { name: "Ciano", value: "cyan", classes: "bg-cyan-900 border-cyan-800 bg-cyan-500 text-cyan-100 hover:bg-cyan-800 bg-cyan-600 hover:bg-cyan-700" },
  ];

  const applyColor = (colorValue) => {
    // Just save to localStorage, reload will apply it via layout
  };

  const handleColorChange = (colorValue) => {
    setSelectedColor(colorValue);
    applyColor(colorValue);
    localStorage.setItem("theme-color", colorValue);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        subtitle="Personalize o sistema"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-blue-600" />
            Tema de Cores
          </CardTitle>
          <CardDescription>
            Escolha a cor principal do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {colors.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorChange(color.value)}
                className={`relative p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                  selectedColor === color.value
                    ? "border-slate-900 shadow-lg"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div
                  className={`h-16 w-full rounded-md mb-2 bg-${color.value}-600`}
                />
                <p className="text-sm font-medium text-center">{color.name}</p>
                {selectedColor === color.value && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <DataExport />

      <Card>
        <CardHeader>
          <CardTitle>Sobre o Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-slate-600">
            <p><strong>Sistema:</strong> Centro de Oftalmologia Sanitária</p>
            <p><strong>Versão:</strong> 1.0</p>
            <p><strong>Módulos:</strong> Treinamentos, Profissionais, Estoque, Agenda</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}