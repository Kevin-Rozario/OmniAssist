export const UPLOAD_CONCURRENCY = 3;

export interface BatchProgress {
  total: number;
  /** Files that finished, successfully or not. */
  done: number;
}

export interface BatchFailure {
  filename: string;
  error: unknown;
}

export interface BatchResult {
  uploaded: number;
  failures: BatchFailure[];
}

/**
 * Uploads every file with a small number in flight at once. One failure never stops the rest:
 * each file is reported on its own so the admin can retry just those.
 */
export async function uploadBatch(
  files: File[],
  upload: (file: File) => Promise<unknown>,
  onProgress?: (progress: BatchProgress) => void,
  concurrency = UPLOAD_CONCURRENCY,
): Promise<BatchResult> {
  const failures: BatchFailure[] = [];
  let uploaded = 0;
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++]!;
      try {
        await upload(file);
        uploaded += 1;
      }
      catch (error) {
        failures.push({ filename: file.name, error });
      }
      done += 1;
      onProgress?.({ total: files.length, done });
    }
  }

  onProgress?.({ total: files.length, done: 0 });
  await Promise.all(Array.from({
    length: Math.min(concurrency, files.length),
  }, worker));
  return { uploaded, failures };
}
