"use client";
import { TEAM_PERSONAS, PERSONA_STORE } from "@/lib/personas";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Handshake,
  Snowflake,
  ClipboardCheck,
  MapPin,
  Compass,
  Layers,
  Store,
  UploadCloud,
  Users,
  LogOut,
  AlertTriangle,
  ChevronDown,
  Briefcase,
  ShieldCheck,
} from "lucide-react";

export function Navbar() {
  const { user, logout, quickLogin } = useAuth();
  const pathname = usePathname();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";

  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user || user.role === "ground_rep") return;
    const refresh = () =>
      Promise.all(
        ["/mapping-issues", "/cold-leads"].map(async (path) => {
          const response = await fetch(`/api${path}?count=true`);
          return [path, response.ok ? (await response.json()).count : 0];
        }),
      )
        .then((rows) => setCounts(Object.fromEntries(rows)))
        .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [user]);
  if (!user) return null;

  const role = user.role;

  const navItems = [
    { name: "Route Builder", href: "/route-planner", icon: Compass, roles: ["super_admin", "b2b_head", "regional_manager"] },
    { name: "Warm Leads", href: "/warm-leads", icon: Users, roles: ["super_admin", "b2b_head","regional_manager","ground_rep","store_associate","analyst"] },
    { name: "New lead", href: "/leads/new", icon: Users, roles: ["super_admin", "b2b_head", "regional_manager", "store_associate"] },
    {
      name: "Import walk-in lead",
      href: "/walk-in",
      icon: Users,
      roles: ["super_admin", "store_associate", "regional_manager", "b2b_head"],
    },
    {
      name: "Data Issues",
      href: "/legacy-data",
      icon: AlertTriangle,
      roles: ["super_admin", "b2b_head"],
    },
    {
      name: "Calling Queue",
      href: "/calling",
      icon: Users,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate"],
    },
    {
      name: "Partners",
      href: "/partners",
      icon: Handshake,
      roles: [
        "super_admin",
        "b2b_head",
        "regional_manager",
        "store_associate",
        "analyst",
        "ground_rep",
      ],
    },
    {
      name: "Consultations",
      href: "/consultations",
      icon: ClipboardCheck,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Mapping Issues",
      href: "/mapping-issues",
      icon: MapPin,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Cold Leads",
      href: "/cold-leads",
      icon: Snowflake,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Compass,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Map View",
      href: "/map",
      icon: MapPin,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Leads Funnel",
      href: "/leads",
      icon: Layers,
      roles: ["super_admin", "b2b_head", "regional_manager", "store_associate", "analyst"],
    },
    {
      name: "Unmapped Queue",
      href: "/unmapped",
      icon: AlertTriangle,
      roles: ["super_admin", "b2b_head", "regional_manager"],
    },
    {
      name: "Store Hub",
      href: "/stores",
      icon: Store,
      roles: ["super_admin", "b2b_head", "regional_manager"],
    },
    {
      name: "Import Leads",
      href: "/import",
      icon: UploadCloud,
      roles: ["super_admin", "b2b_head"],
    },
    {
      name: "Ground Team",
      href: "/reps",
      icon: Users,
      roles: ["super_admin", "b2b_head", "regional_manager"],
    },
    {
      name: "My Visits",
      href: "/rep-portal",
      icon: Briefcase,
      roles: ["super_admin", "ground_rep", "regional_manager", "b2b_head"],
    },
  ];

  const order = [
    "/dashboard",
    "/map",
    "/mapping-issues",
    "/cold-leads",
    "/leads",
    "/consultations",
  ];
  const filteredNav = navItems
    .filter((item) => item.roles.includes(role))
    .sort(
      (a, b) =>
        (order.includes(a.href) ? order.indexOf(a.href) : 99) -
        (order.includes(b.href) ? order.indexOf(b.href) : 99),
    );
  const primaryPaths =
    role === "ground_rep"
      ? ["/rep-portal", "/warm-leads", "/partners"]
      : role === "store_associate"
        ? ["/dashboard", "/calling", "/walk-in", "/warm-leads", "/partners"]
        : ["/dashboard", "/leads", "/warm-leads", "/map", "/calling"];
  const primaryNav = primaryPaths.flatMap((path) =>
    filteredNav.filter((item) => item.href === path),
  );
  const moreNav = filteredNav.filter(
    (item) => !primaryPaths.includes(item.href),
  );

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    b2b_head: "B2B Head",
    regional_manager: "Store Lead",
    store_associate: "Store Associate",
    ground_rep: "Ground Rep",
    analyst: "Ops Analyst",
  };

  const handleRoleSwitch = async (email: string) => {
    setRoleMenuOpen(false);
    await quickLogin(email);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Top-Left Brand Logo & Name */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="shrink-0 text-lg font-extrabold tracking-tight text-[#ff4500]"
            >
              FLORZY B2B
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex shrink-0 whitespace-nowrap items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-[#ff4500]/10 text-[#ff4500] border border-[#ff4500]/30 shadow-xs"
                        : "text-slate-600 hover:text-[#ff4500] hover:bg-slate-100/80"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>
                      {item.name}
                      {counts[item.href] ? ` (${counts[item.href]})` : ""}
                    </span>
                  </Link>
                );
              })}
              {moreNav.length > 0 && (
                <details className="relative">
                  <summary className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-slate-600">
                    More
                  </summary>
                  <div className="absolute top-11 left-0 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    {moreNav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={
                          pathname === item.href ? "page" : undefined
                        }
                        className={`block rounded-lg px-3 py-2.5 text-sm ${pathname === item.href ? "bg-orange-50 text-orange-700" : "hover:bg-slate-50"}`}
                        onClick={(e) =>
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open")
                        }
                      >
                        {item.name}
                        {counts[item.href] ? ` (${counts[item.href]})` : ""}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Persona Switcher — Super Admin ONLY */}
            {isSuperAdmin && (
              <div className="relative">
                <button
                  onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 transition-all cursor-pointer shadow-2xs"
                  title="Persona Switcher (Super Admin only)"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Persona Switcher</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>

                {roleMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="flex items-center gap-2 mb-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Quick Persona Switcher
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Super Admin · Test role-based access & permissions
                      </p>
                    </div>

                    <div className="mt-1 space-y-1 max-h-[60vh] overflow-y-auto">
                      {TEAM_PERSONAS.map((person) => (
                        <button
                          key={person.email}
                          onClick={() => handleRoleSwitch(person.email)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 ${user.email === person.email ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-slate-100"}`}
                        >
                          <div>
                            <span className="font-bold">{person.name}</span>
                            <p className="text-[11px] text-slate-600">
                              {person.label}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {PERSONA_STORE}
                            </p>
                          </div>
                          {user.email === person.email && (
                            <span className="text-[10px] font-bold">Current</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Role badge for non-super-admin */}
            {!isSuperAdmin && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 bg-slate-50 text-slate-700">
                <span className="hidden sm:inline">{roleLabels[role] || "User"}</span>
                <span className="sm:hidden">Account</span>
              </div>
            )}

            <nav
              className="lg:hidden relative"
              aria-label="Workspace navigation"
            >
              <details>
                <summary className="cursor-pointer p-2 text-xs">Menu</summary>
                <div className="absolute right-0 top-10 z-[80] bg-white border rounded-xl shadow-lg p-2 w-56 max-h-[70vh] overflow-auto">
                  {filteredNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg p-3 text-sm ${pathname === item.href ? "bg-orange-50 text-orange-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}
                      onClick={(e) =>
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open")
                      }
                    >
                      <item.icon size={16} />
                      {item.name}
                      {counts[item.href] ? ` (${counts[item.href]})` : ""}
                    </Link>
                  ))}
                </div>
              </details>
            </nav>

            {/* User Profile & Sign Out */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="hidden min-[1800px]:block text-right">
                <p className="text-xs font-bold text-slate-800 truncate max-w-[130px]">
                  {user.name}
                </p>
                <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                  {user.email}
                </p>
              </div>

              <button
                onClick={logout}
                className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
