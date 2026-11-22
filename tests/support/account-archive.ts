import { fromBuffer } from "yauzl";
export async function unzip(bytes: Uint8Array) {
  return new Promise<Record<string, Buffer>>((resolve, reject) =>
    fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const files: Record<string, Buffer> = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on("error", reject);
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            files[entry.fileName] = Buffer.concat(chunks);
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    }),
  );
}
