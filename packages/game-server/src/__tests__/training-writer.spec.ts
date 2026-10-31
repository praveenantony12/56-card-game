/**
 * Training JSONL writer tests: file naming, ordering, and failure isolation.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  TrainingWriter,
  sanitizeSegment,
  trainingFileName,
} from "../training/TrainingWriter";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "training-writer-"));
}

function removeDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  fs.rmdirSync(dir);
}

describe("sanitizeSegment / trainingFileName", () => {
  test("keeps short safe ids unchanged", () => {
    expect(sanitizeSegment("4a8a3160-d4d1-11f1-80c5")).toBe("4a8a3160-d4d1-11f1-80c5");
  });

  test("hashes anything that could escape the directory", () => {
    ["../../etc/passwd", "a/b", "a\\b", "..", ".", "", "has space", "x".repeat(65)].forEach((bad) => {
      const safe = sanitizeSegment(bad);
      expect(safe).toMatch(/^h_[0-9a-f]{12}$/);
    });
  });

  test("hashing is deterministic and distinguishes inputs", () => {
    expect(sanitizeSegment("../a")).toBe(sanitizeSegment("../a"));
    expect(sanitizeSegment("../a")).not.toBe(sanitizeSegment("../b"));
  });

  test("file name is <game>--<hand>.jsonl", () => {
    expect(trainingFileName("game1", "2026-01-01T00-00-00-000Z")).toBe(
      "game1--2026-01-01T00-00-00-000Z.jsonl",
    );
  });

  test("a hostile game id stays inside the output directory", () => {
    const writer = new TrainingWriter("/out");
    const file = writer.filePathFor("../../etc/passwd", "h");
    expect(path.dirname(file)).toBe(path.resolve("/out"));
  });
});

describe("TrainingWriter", () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir();
  });
  afterEach(() => removeDir(dir));

  test("appends one JSON line per record, in call order", async () => {
    const writer = new TrainingWriter(dir);
    for (let i = 1; i <= 50; i++) writer.append("g", "h", { seq: i });
    await writer.flush();

    const lines = fs
      .readFileSync(path.join(dir, "g--h.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(writer.recordsWritten).toBe(50);
    expect(writer.writeFailures).toBe(0);
  });

  test("different hands of one game use different files", async () => {
    const writer = new TrainingWriter(dir);
    writer.append("g", "hand-1", { n: 1 });
    writer.append("g", "hand-2", { n: 2 });
    await writer.flush();
    expect(fs.readdirSync(dir).sort()).toEqual(["g--hand-1.jsonl", "g--hand-2.jsonl"]);
  });

  test("creates the output directory when it does not exist", async () => {
    const nested = path.join(dir, "a", "b");
    const writer = new TrainingWriter(nested);
    writer.append("g", "h", { ok: true });
    await writer.flush();
    expect(fs.existsSync(path.join(nested, "g--h.jsonl"))).toBe(true);
    fs.unlinkSync(path.join(nested, "g--h.jsonl"));
    fs.rmdirSync(nested);
    fs.rmdirSync(path.join(dir, "a"));
  });

  test("serializes immediately, so later mutation does not change the line", async () => {
    const writer = new TrainingWriter(dir);
    const record = { value: "before" };
    writer.append("g", "h", record);
    record.value = "after";
    await writer.flush();
    expect(fs.readFileSync(path.join(dir, "g--h.jsonl"), "utf8")).toContain("before");
  });

  test("a write failure is counted and reported once, never thrown", async () => {
    // The output "directory" is an existing file, so it can never be created.
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "x");
    const errors: string[] = [];
    const writer = new TrainingWriter(blocker, (context) => errors.push(context));

    expect(() => {
      writer.append("g", "h", { seq: 1 });
      writer.append("g", "h", { seq: 2 });
    }).not.toThrow();
    await writer.flush();

    expect(writer.writeFailures).toBe(2);
    expect(writer.recordsWritten).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("g--h.jsonl");
    fs.unlinkSync(blocker);
  });

  test("an unserializable record is counted, not thrown", async () => {
    const errors: string[] = [];
    const writer = new TrainingWriter(dir, (context) => errors.push(context));
    const circular: any = {};
    circular.self = circular;

    expect(() => writer.append("g", "h", circular)).not.toThrow();
    await writer.flush();
    expect(writer.writeFailures).toBe(1);
    expect(errors).toHaveLength(1);
  });

  test("a throwing error handler cannot break the writer", async () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "x");
    const writer = new TrainingWriter(blocker, () => {
      throw new Error("handler failure");
    });
    expect(() => writer.append("g", "h", {})).not.toThrow();
    await expect(writer.flush()).resolves.toBeUndefined();
    fs.unlinkSync(blocker);
  });
});
