import type { Box, Candidate } from "./domain";
export interface PlaceSearchProvider {
  search(query: string, box?: Box): Promise<Candidate[]>;
}
