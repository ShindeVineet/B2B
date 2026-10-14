import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getUserFilterForUser } from "@/lib/permissions";
import { Role, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const roleParam = searchParams.get("role");
    const regionParam = searchParams.get("region");
    const storeIdParam = searchParams.get("store_id");

    const where: Prisma.UserWhereInput = { active: true };

    if (searchParams.get("assignable") === "true")
      where.role = { in: ["ground_rep", "regional_manager", "b2b_head"] };
    if (roleParam && Object.values(Role).includes(roleParam as Role)) {
      where.role = roleParam as Role;
    }

    if (regionParam && regionParam !== "All") {
      where.region = regionParam;
    }

    if (storeIdParam) {
      where.store_id = storeIdParam;
    }

    const users = await prisma.user.findMany({
      where: { AND: [getUserFilterForUser(user), where] },
      select: {
        id: true,
        name: true,
        designation: true,
        email: true,
        role: true,
        region: true,
        store_id: true,
        phone: true,
        assigned_store: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !["b2b_head", "regional_manager"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    if (body.role !== undefined) {
      if (user.role !== "b2b_head") return NextResponse.json({error:"Only B2B Head can change roles"},{status:403});
      if (typeof body.id !== "string" || !Object.values(Role).includes(body.role)) return NextResponse.json({error:"Choose a valid member and role"},{status:400});
      if (body.id === user.id && body.role !== "b2b_head") return NextResponse.json({error:"You cannot remove your own Head access"},{status:400});
      await prisma.user.update({where:{id:body.id},data:{role:body.role}});
      return NextResponse.json({success:true});
    }
    if (
      typeof body.id !== "string" ||
      typeof body.store_id !== "string" ||
      !body.store_id
    )
      return NextResponse.json(
        { error: "Choose a member and active base store" },
        { status: 400 },
      );
    const member = await prisma.user.findFirst({
      where: {
        id: body.id,
        active: true,
        role: { in: ["ground_rep", "regional_manager", "b2b_head", "store_associate"] },
        AND: [getUserFilterForUser(user)],
      },
    });
    const store = await prisma.store.findFirst({
      where: {
        id: body.store_id,
        active: true,

      },
    });
    if (!member || !store)
      return NextResponse.json(
        { error: "Member or store is outside your scope" },
        { status: 403 },
      );
    await prisma.user.update({
      where: { id: member.id },
      data: { store_id: store.id, region: store.region },
    });
    const count = await prisma.lead.count({
      where: {
        assigned_ground_rep_id: member.id,
        OR: [
          { assigned_store_id: null },
          { assigned_store_id: { not: store.id } },
        ],
      },
    });
    return NextResponse.json({
      success: true,
      leads_needing_store_review: count,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to update base store" },
      { status: 500 },
    );
  }
}
