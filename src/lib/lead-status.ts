export const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    bg: string;
    text: string;
    hex: string;
    glow: string;
    border: string;
    icon: string;
  }
> = {
  New: {
    label: "New Lead",
    bg: "bg-slate-100",
    text: "text-slate-800",
    hex: "#64748b",
    glow: "rgba(100, 116, 139, 0.4)",
    border: "border-slate-300",
    icon: "⚡",
  },
  Assigned: {
    label: "Assigned",
    bg: "bg-blue-50",
    text: "text-blue-700",
    hex: "#2563eb",
    glow: "rgba(37, 99, 235, 0.5)",
    border: "border-blue-200",
    icon: "👤",
  },
  Hot: {
    label: "Hot Lead",
    bg: "bg-orange-50",
    text: "text-[#ff4500]",
    hex: "#ff4500",
    glow: "rgba(255, 69, 0, 0.6)",
    border: "border-[#ff4500]/40",
    icon: "🔥",
  },
  Cold: {
    label: "Cold Lead",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    hex: "#0891b2",
    glow: "rgba(8, 145, 178, 0.5)",
    border: "border-cyan-200",
    icon: "❄️",
  },
  Converted: {
    label: "Converted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    hex: "#059669",
    glow: "rgba(5, 150, 105, 0.6)",
    border: "border-emerald-300",
    icon: "🏆",
  },
  Lost: {
    label: "Closed Lost",
    bg: "bg-rose-50",
    text: "text-rose-700",
    hex: "#e11d48",
    glow: "rgba(225, 29, 72, 0.5)",
    border: "border-rose-200",
    icon: "✕",
  },
};

STATUS_CONFIG.onboarded = { ...STATUS_CONFIG.Converted, label: "Onboarded" };
STATUS_CONFIG["Needs Manager Review"] = {
  ...STATUS_CONFIG.Cold,
  label: "Cold Leads",
};
