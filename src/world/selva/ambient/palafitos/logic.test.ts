import { describe, expect, test } from "bun:test";
import { ARTIFACTS } from "../../../../data/career";
import type { WorldRepo } from "../../../data";
import { buildSelvaLayout } from "../../layout";
import { HOUSE_W, MAX_REPOS, PIER_GAP, projects, rowSlots } from "./logic";

const repo = (name: string, stars: number): WorldRepo => ({
  name,
  stars,
  description: null,
  url: `https://github.com/x/${name}`,
  language: "TypeScript",
  pushedAt: "2025-01-01T00:00:00Z",
});

describe("palafitos projects", () => {
  test("every case study of the projects page, then the most-starred repos", () => {
    const p = projects([repo("a", 1), repo("b", 9), repo("c", 4), repo("d", 7)]);
    expect(p.filter((x) => x.kind === "case").map((x) => x.id)).toEqual(ARTIFACTS.map((a) => a.id));
    const repos = p.filter((x) => x.kind === "repo");
    expect(repos.length).toBe(MAX_REPOS);
    expect(repos.map((x) => (x.kind === "repo" ? x.name : ""))).toEqual(["b", "d", "c"]);
  });
  test("case uses are chronological with company, year and role", () => {
    for (const c of projects([])) {
      if (c.kind !== "case") continue;
      expect(c.uses.length).toBeGreaterThan(0);
      for (let i = 1; i < c.uses.length; i++) expect(c.uses[i]!.year >= c.uses[i - 1]!.year).toBe(true);
      for (const u of c.uses) {
        expect(u.company).toBeTruthy();
        expect(u.role.es && u.role.en).toBeTruthy();
      }
    }
  });
  test("offline build: only the case studies", () => {
    expect(projects([]).length).toBe(ARTIFACTS.length);
  });
});

describe("palafitos row", () => {
  test("keeps the pier slot free and never overlaps", () => {
    const s = rowSlots(ARTIFACTS.length + MAX_REPOS);
    const xs = s.map((x) => x.x).sort((a, b) => a - b);
    for (const x of xs) expect(Math.abs(x) - HOUSE_W / 2).toBeGreaterThanOrEqual(PIER_GAP - 1e-9);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(HOUSE_W);
  });
  test("each porch (in front of a house) stands on the flat apron", () => {
    const L = buildSelvaLayout({ cells: 280 });
    const pose = L.stationPose("palafitos");
    const c = Math.cos(pose.yaw);
    const sn = Math.sin(pose.yaw);
    const y0 = L.heightAt(pose.position.x, pose.position.z);
    for (const sl of rowSlots(ARTIFACTS.length + MAX_REPOS)) {
      const lz = sl.z + 2.3;
      const x = pose.position.x + sl.x * c + lz * sn;
      const z = pose.position.z - sl.x * sn + lz * c;
      expect(Math.abs(L.heightAt(x, z) - y0)).toBeLessThan(0.35);
    }
  });
});
