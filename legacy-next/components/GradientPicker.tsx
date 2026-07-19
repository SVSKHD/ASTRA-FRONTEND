import React, { useState, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Copy, RefreshCw, Layers } from "lucide-react";

interface GradientPickerProps {
  initialBackground: string;
  onChange: (background: string) => void;
  onClose: () => void;
}

const PRESETS = [
  "linear-gradient(135deg, #FF6B6B 0%, #556270 100%)",
  "linear-gradient(45deg, #FA8BFF 0%, #2BD2FF 52%, #2BFF88 90%)",
  "linear-gradient(to right, #24c6dc, #514a9d)",
  "linear-gradient(to right, #f83600 0%, #f9d423 100%)",
  "linear-gradient(109.6deg, rgb(36, 45, 57) 11.2%, rgb(16, 37, 60) 51.2%, rgb(0, 0, 0) 98.6%)",
  "#000000",
];

export default function GradientPicker({
  initialBackground,
  onChange,
  onClose,
}: GradientPickerProps) {
  const [gradientType, setGradientType] = useState<"linear" | "solid">(
    "linear",
  );
  const [colors, setColors] = useState<string[]>(["#4a00e0", "#8e2de2"]);
  const [degree, setDegree] = useState(135);
  const [activeColorIndex, setActiveColorIndex] = useState(0);
  const [mode, setMode] = useState<"presets" | "custom">("custom");

  useEffect(() => {
    if (gradientType === "solid") {
      onChange(colors[0]);
    } else {
      const gradientString = `linear-gradient(${degree}deg, ${colors.join(", ")})`;
      onChange(gradientString);
    }
  }, [colors, degree, gradientType]);

  const handleColorChange = (newColor: string) => {
    const newColors = [...colors];
    newColors[activeColorIndex] = newColor;
    setColors(newColors);
  };

  const addColorStop = () => {
    if (colors.length < 5) {
      setColors([...colors, "#ffffff"]);
      setActiveColorIndex(colors.length);
    }
  };

  const removeColorStop = (index: number) => {
    if (colors.length > 2) {
      const newColors = colors.filter((_, i) => i !== index);
      setColors(newColors);
      setActiveColorIndex(Math.min(activeColorIndex, newColors.length - 1));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      className="z-50 w-80 p-4 rounded-3xl bg-[#1C1C1E] border border-white/10 shadow-2xl ring-1 ring-white/5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <Layers size={14} className="text-blue-400" />
          Theme Editor
        </h3>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="flex bg-white/5 rounded-full p-1 mb-4 border border-white/5">
        <button
          onClick={() => setMode("custom")}
          className={`flex-1 text-xs py-1.5 rounded-full transition-all ${
            mode === "custom"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/50 hover:text-white"
          }`}
        >
          Custom
        </button>
        <button
          onClick={() => setMode("presets")}
          className={`flex-1 text-xs py-1.5 rounded-full transition-all ${
            mode === "presets"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/50 hover:text-white"
          }`}
        >
          Presets
        </button>
      </div>

      {mode === "presets" ? (
        <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
          {PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => {
                if (preset.startsWith("#") || preset.startsWith("rgb")) {
                  setGradientType("solid");
                  setColors([preset]);
                } else {
                  onChange(preset);
                }
              }}
              className="h-16 rounded-xl border border-white/10 hover:border-white/30 transition-all relative group overflow-hidden"
              style={{ background: preset }}
            >
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center py-2">
            <HexColorPicker
              color={colors[activeColorIndex]}
              onChange={handleColorChange}
              style={{ width: "100%", height: "160px" }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs text-white/70">
              <span>Gradient Type</span>
              <div className="flex gap-2 bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => {
                    setGradientType("linear");
                    if (colors.length < 2) setColors([...colors, "#000000"]);
                  }}
                  className={`px-2 py-1 rounded-md transition-all ${gradientType === "linear" ? "bg-white/20 text-white" : "hover:text-white"}`}
                >
                  Linear
                </button>
                <button
                  onClick={() => {
                    setGradientType("solid");
                    setColors([colors[0]]);
                  }}
                  className={`px-2 py-1 rounded-md transition-all ${gradientType === "solid" ? "bg-white/20 text-white" : "hover:text-white"}`}
                >
                  Solid
                </button>
              </div>
            </div>

            {gradientType === "linear" && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/50">
                    <span>Angle</span>
                    <span>{degree}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={degree}
                    onChange={(e) => setDegree(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-white/50">
                    <span>Colors stops</span>
                    <button
                      onClick={addColorStop}
                      disabled={colors.length >= 5}
                      className="hover:text-white disabled:opacity-30"
                    >
                      + Add Stop
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {colors.map((color, idx) => (
                      <div key={idx} className="relative group">
                        <button
                          onClick={() => setActiveColorIndex(idx)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            activeColorIndex === idx
                              ? "border-white scale-110 shadow-lg shadow-white/20"
                              : "border-white/20 hover:border-white/50"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                        {colors.length > 2 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeColorStop(idx);
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 rounded-full w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={8} className="text-white" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
