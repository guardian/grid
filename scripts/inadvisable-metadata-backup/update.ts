import { exiftool } from "exiftool-vendored";
import { toWriteTags } from "./ImageMetadata";
import path from "path";

const [, , id] = process.argv;

console.log(
  `Ran with ${id}, expecting ${id}.json and ${id} to be in working directory.`
);

const { data } = require(path.resolve(`${id}.json`));
const { fileMetadata, originalMetadata } = data;

(async () => {
  const tags = toWriteTags(originalMetadata, fileMetadata)
  console.log(JSON.stringify(tags,null,2))
  await exiftool.write(`${id}`, tags);
  await exiftool.end();
  console.log("Updated local metadata.");
})();
