export function revisitOwner(area: unknown): string | undefined {
  if (!area || typeof area !== "object" || Array.isArray(area)) return undefined;
  const value = area as { kind?: unknown; rep_id?: unknown };
  return value.kind === "assigned_revisit" && typeof value.rep_id === "string" && value.rep_id
    ? value.rep_id : undefined;
}
export function routeInWorkspace(route: { status: string; area_filter?: unknown }, tab: string, person: string) {
  if (tab === "planning" || tab === "revisits") {
    if (!["draft", "ready"].includes(route.status)) return false;
    const owner = revisitOwner(route.area_filter);
    return tab === "revisits" ? !!person && owner === person : !owner;
  }
  return route.status === tab;
}
