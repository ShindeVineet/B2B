import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/page-auth";

export default async function Home() {
  const user = await requirePageUser();
  redirect(
    user.role === "ground_rep"
      ? "/rep-portal"
      : "/dashboard",
  );
}
