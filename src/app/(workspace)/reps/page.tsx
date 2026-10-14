import {TeamRoleSelect} from "@/components/shared/TeamRoleSelect";
import { TeamStoreAssignment } from "@/components/shared/TeamStoreAssignment";
import { SelectableRows } from "@/components/shared/SelectableRows";
import { requirePageUser } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getUserFilterForUser } from "@/lib/permissions";
import { Users } from "lucide-react";

export default async function TeamPage() {
  const user = await requirePageUser(["b2b_head", "regional_manager"]);
  const team = await prisma.user.findMany({
    where: { AND: [getUserFilterForUser(user), { active: true }] },
    select: {
      id: true,
      name: true,
      designation: true,
      email: true,
      role: true,
      store_id: true,
      region: true,
      phone: true,
      assigned_store: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const stores = await prisma.store.findMany({
    where: {
      active: true,

    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 bg-white min-h-screen text-slate-900">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-[#ff4500]" />
          FLORZY B2B Ground Team & Staff
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Active managers, ground reps, and analysts assigned within your area
          of responsibility.
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <SelectableRows>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Designation</th>
                <th className="px-5 py-3.5">Email & Phone</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Assigned Region</th>
                <th className="px-5 py-3.5">Base Store Hub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {team.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-4 font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#ff4500] font-bold border border-orange-200 flex items-center justify-center text-xs">
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span>{member.name}</span>
                  </td>
                  <td className="px-5 py-4">
                    {member.designation || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-slate-800 block">{member.email}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {member.phone || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 uppercase tracking-wide">
                      {user.role === "b2b_head" ? <TeamRoleSelect id={member.id} role={member.role} /> : member.role === "regional_manager" ? "Store Lead" : member.role.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-800">
                    {member.region || "All Regions"}
                  </td>
                  <td className="px-5 py-4">
                    {member.role !== "analyst" ? (
                      <TeamStoreAssignment
                        memberId={member.id}
                        storeId={member.store_id}
                        stores={stores}
                      />
                    ) : member.assigned_store ? (
                      <span className="text-xs font-bold text-[#ff4500] flex items-center gap-1">
                        🏬 {member.assigned_store.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">
                        Regional / Unassigned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SelectableRows>
        {!team.length && (
          <p className="p-8 text-center text-slate-400 text-xs">
            No active team members found.
          </p>
        )}
      </div>
    </div>
  );
}
