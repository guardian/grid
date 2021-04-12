import { exiftool } from "exiftool-vendored";
import path from "path";

const [, , fileName] = process.argv;

(async () => {
  const t = await exiftool.read(path.resolve(fileName)) as any
  console.log(t.FileMetadata)
  await exiftool.end();
})();
