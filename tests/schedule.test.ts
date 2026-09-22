import {describe,expect,it} from "vitest";
import {courseName,mergeTime,nextDate,parseText,room} from "../src/lib/schedule";
describe("deterministic schedule transforms",()=>{
 it("expands markers",()=>{expect(courseName("Basis Data*")).toContain("Ujian Utama");expect(courseName("Algoritma**")).toContain("Praktikum Penunjang")});
 it("merges periods",()=>expect(mergeTime("1/2")).toBe("07:30-09:30"));
 it("decodes rooms",()=>expect(room("G237").text).toContain("Gedung 2, Lantai 3, Ruang 7"));
 it("gets weekday on or after base day",()=>expect(nextDate("Senin",new Date(2026,8,23)).iso).toBe("2026-09-28"));
 it("parses tabular input",()=>expect(parseText("KELAS\tHARI\tMATA KULIAH\tWAKTU\tRUANG\tDOSEN\n1SC03\tSenin\tBasis Data*\t1/2\tG237\tDOSEN")).toHaveLength(1));
});
