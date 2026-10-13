import { prisma } from "../prisma";
import { normalizedName, type Box, type Candidate } from "./domain";
import type { PlaceSearchProvider } from "./provider";
export class LocalPoiProvider implements PlaceSearchProvider {
  async search(company: string, box?: Box): Promise<Candidate[]> {
    if (!box || !company.trim()) return [];
    const ready = await prisma.osmPoiRefresh.findUnique({
      where: { id: "india" },
    });
    if (!ready?.refreshed_at || !ready.poi_count)
      throw Error(
        "Local POI index is not loaded; retry after refresh completes",
      );
    const query = normalizedName(company).join(" ");
    if (!query) return [];
    const rows = await prisma.$queryRaw<
      Array<{
        name: string;
        lat: number;
        lng: number;
        address: string;
        kind: string;
      }>
    >`
      SELECT name, lat, lng, address, kind FROM osm_poi_index
      WHERE lat BETWEEN ${box.south} AND ${box.north} AND lng BETWEEN ${box.west} AND ${box.east}
        AND normalized_name % ${query}
      ORDER BY similarity(normalized_name, ${query}) DESC, osm_id LIMIT 30`;
    return rows.map((row) => ({
      ...row,
      displayName: [row.name, row.address].filter(Boolean).join(", "),
      rank: 30,
    }));
  }
}
