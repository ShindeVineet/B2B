import areas from "@/data/pincode-area-mapping.json";
export type PincodeArea = { primary_areas: string; ground_team_status: string; priority: string; store_target: string };
/** User-supplied coverage labels. Store targets are reference names, not assignments. */
export function pincodeArea(pin: string | null | undefined): PincodeArea | null {
  return (areas as Record<string, PincodeArea>)[pin?.trim() || ""] || null;
}
