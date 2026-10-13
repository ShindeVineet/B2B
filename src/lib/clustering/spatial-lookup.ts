import type { ClusterLead, DistanceLookup } from "./cluster-leads";
import { distanceKm, type Coordinates } from "../location";
type Vector = [number, number, number];
type Node = {
  lead: ClusterLead;
  vector: Vector;
  axis: number;
  left: Node | null;
  right: Node | null;
};
function vector(p: Coordinates): Vector {
  const lat = (p.lat * Math.PI) / 180,
    lng = (p.lng * Math.PI) / 180;
  return [
    Math.cos(lat) * Math.cos(lng),
    Math.cos(lat) * Math.sin(lng),
    Math.sin(lat),
  ];
}
const stable = (a: ClusterLead, b: ClusterLead) =>
  b.lat - a.lat || a.lng - b.lng || a.id.localeCompare(b.id);
// A 3-D unit-sphere k-d tree: chord distance is monotonic with haversine distance.
// Tree structure is immutable; the pool supplied per query controls active points.
export function createSpatialLookup(
  leads: readonly ClusterLead[],
): DistanceLookup {
  function build(
    rows: { lead: ClusterLead; vector: Vector }[],
    depth = 0,
  ): Node | null {
    if (!rows.length) return null;
    const axis = depth % 3;
    rows.sort(
      (a, b) => a.vector[axis] - b.vector[axis] || stable(a.lead, b.lead),
    );
    const mid = Math.floor(rows.length / 2);
    return {
      ...rows[mid],
      axis,
      left: build(rows.slice(0, mid), depth + 1),
      right: build(rows.slice(mid + 1), depth + 1),
    };
  }
  const root = build(leads.map((lead) => ({ lead, vector: vector(lead) })));
  return (point, pool, count) => {
    if (count <= 0 || !pool.length) return [];
    const k = Math.min(count, pool.length),
      active = new Set(pool.map((l) => l.id)),
      target = vector(point),
      best: { lead: ClusterLead; distance: number }[] = [];
    function visit(node: Node | null) {
      if (!node) return;
      const diff = target[node.axis] - node.vector[node.axis],
        near = diff < 0 ? node.left : node.right,
        far = diff < 0 ? node.right : node.left;
      visit(near);
      if (active.has(node.lead.id)) {
        const distance = node.vector.reduce(
          (sum, x, i) => sum + (x - target[i]) ** 2,
          0,
        );
        best.push({ lead: node.lead, distance });
        best.sort((a, b) => a.distance - b.distance || stable(a.lead, b.lead));
        if (best.length > k) best.pop();
      }
      if (
        best.length < k ||
        diff * diff <= (best.at(-1)?.distance ?? Infinity) + 1e-15
      )
        visit(far);
    }
    visit(root);
    return best
      .map((v) => v.lead)
      .sort(
        (a, b) => distanceKm(point, a) - distanceKm(point, b) || stable(a, b),
      );
  };
}
