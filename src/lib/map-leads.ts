export async function fetchAllMapLeads<T extends { id: string }>(
  request: typeof fetch = fetch,
): Promise<T[]> {
  const leads = new Map<string, T>();
  let fetchedCount = 0;
  let page = 1;
  while (true) {
    const response = await request(`/api/leads?limit=1000&page=${page}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Unable to load all map leads. Please reload.");
    const data: { leads: T[]; totalCount: number } = await response.json();
    for (const lead of data.leads) leads.set(lead.id, lead);
    fetchedCount += data.leads.length;
    if (fetchedCount >= data.totalCount) return [...leads.values()];
    if (data.leads.length === 0)
      throw new Error("Lead list changed while loading. Please reload.");
    page++;
  }
}

export { canPlotLead as hasMapCoordinates } from "./mapping/visibility";
