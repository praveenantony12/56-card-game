import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const appendFile = promisify(fs.appendFile);

export type TrainingErrorHandler = (context: string, error: any) => void;

/**
 * A path segment is kept as-is only when it is short and made of safe
 * characters; anything else is replaced by a hash of the original, so ids that
 * come from outside (or contain "..", slashes, etc.) can never escape the
 * output directory.
 */
export function sanitizeSegment(value: string): string {
  const text = String(value);
  if (/^[A-Za-z0-9_-]{1,64}$/.test(text)) {
    return text;
  }
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return `h_${hash.slice(0, 12)}`;
}

/** Name of the per-hand file: <game>--<hand>.jsonl. */
export function trainingFileName(gameId: string, handId: string): string {
  return `${sanitizeSegment(gameId)}--${sanitizeSegment(handId)}.jsonl`;
}

/**
 * Appends JSONL lines to per-hand files.
 *
 * Writes to one file are chained so they land in call order. A failure never
 * throws to the caller: it is counted, reported once per file through onError,
 * and later writes are still attempted.
 */
export class TrainingWriter {
  private chains: { [file: string]: Promise<void> } = {};
  private failedFiles: { [file: string]: boolean } = {};
  private dirReady = false;
  public recordsQueued = 0;
  public recordsWritten = 0;
  public writeFailures = 0;

  constructor(
    private outputDir: string,
    private onError: TrainingErrorHandler = () => {},
  ) {}

  /** Absolute path of the file for a hand. */
  public filePathFor(gameId: string, handId: string): string {
    return path.join(this.outputDir, trainingFileName(gameId, handId));
  }

  /**
   * Queues one record. The record is serialized immediately, so later changes
   * to the object cannot alter what is written.
   */
  public append(gameId: string, handId: string, record: object): void {
    let line: string;
    let file: string;
    try {
      line = JSON.stringify(record) + "\n";
      file = this.filePathFor(gameId, handId);
    } catch (error) {
      this.fail(path.join(this.outputDir, "(unserializable)"), error);
      return;
    }

    this.recordsQueued++;
    const previous = this.chains[file] || Promise.resolve();
    this.chains[file] = previous.then(() => this.write(file, line));
  }

  /** Resolves when every queued write has finished (successfully or not). */
  public flush(): Promise<void> {
    const pending = Object.keys(this.chains).map((file) => this.chains[file]);
    return Promise.all(pending).then(() => undefined);
  }

  private write(file: string, line: string): Promise<void> {
    try {
      if (!this.dirReady) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        this.dirReady = true;
      }
    } catch (error) {
      this.fail(file, error);
      return Promise.resolve();
    }

    return appendFile(file, line).then(
      () => {
        this.recordsWritten++;
      },
      (error: any) => {
        // The directory may have been removed; recreate it on the next write.
        this.dirReady = false;
        this.fail(file, error);
      },
    );
  }

  private fail(file: string, error: any): void {
    this.writeFailures++;
    if (this.failedFiles[file]) {
      return;
    }
    this.failedFiles[file] = true;
    try {
      this.onError(`Failed to write training record to ${file}`, error);
    } catch (_) {
      // Reporting must never break the writer.
    }
  }
}
