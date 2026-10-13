"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PhoneCall, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
export function LocationQueueToast() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (
      !user ||
      !["b2b_head", "regional_manager", "store_associate"].includes(user.role)
    )
      return;
    let live = true;
    const load = async () => {
      try {
        const r = await fetch("/api/calling-locations?notifications=true", {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!live) return;
        const key = `location-calling-seen:${user.id}`;
        const old = new Set<string>(
          JSON.parse(sessionStorage.getItem(key) || "[]"),
        );
        const ids = d.items.map(
          (i: { id: string; geocode_flagged_at: string | null }) =>
            `${i.id}:${i.geocode_flagged_at || ""}`,
        );
        const arrived = ids.filter((id: string) => !old.has(id)).length;
        sessionStorage.setItem(key, JSON.stringify(ids));
        if (arrived) setCount(arrived);
      } catch {
        /* Retry on the next interval; don't disrupt the workspace. */
      }
    };
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user]);
  if (
    !count ||
    !user ||
    !["b2b_head", "regional_manager", "store_associate"].includes(user.role)
  )
    return null;
  return (
    <aside
      role="status"
      className="fixed bottom-4 right-4 z-[150] max-w-[calc(100vw-2rem)] w-80 rounded-xl border border-orange-200 bg-white p-4 shadow-lg text-slate-900"
    >
      <button
        className="float-right p-1"
        aria-label="Dismiss calling notification"
        onClick={() => setCount(0)}
      >
        <X size={16} />
      </button>
      <p className="font-semibold flex items-center gap-2">
        <PhoneCall size={18} className="text-orange-600" /> Location calls
        needed
      </p>
      <p className="text-sm mt-2">
        {count} lead{count === 1 ? "" : "s"} with “not found” locations{" "}
        {count === 1 ? "is" : "are"} now in your calling queue.
      </p>
      <Link
        className="mt-2 inline-block text-sm font-bold text-orange-700 underline"
        href="/calling?tab=Location"
        onClick={() => setCount(0)}
      >
        Open calling queue
      </Link>
    </aside>
  );
}
