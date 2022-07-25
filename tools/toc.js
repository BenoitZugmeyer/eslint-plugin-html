const { readFileSync: read, writeFileSync: write } = require("fs")

const action = process.argv[2]

switch (action) {
  case "check": {
    const currentToc = splitReadme()[1]
    if (currentToc !== generateToc()) {
      console.log("Table of content is outdated. Use 'write' to update it.")
      process.exit(1)
    } else {
      console.log("Table of content is up to date.")
    }
    break
  }

  case "write": {
    const [start, _, end] = splitReadme()
    writeReadme(start + generateToc() + end)
    break
  }

  default:
    console.log(
      `${process.argv[1]} takes one argument, either "check" or "write"`
    )
    process.exit(1)
}

function readReadme() {
  return read("README.md", { encoding: "utf-8" })
}

function writeReadme(content) {
  write("README.md", content, { encoding: "utf-8" })
}

function splitReadme() {
  const content = readReadme()
  let startTocIndex = content.indexOf("\n\n") + 2
  let endTocIndex = content.indexOf("\n\n", startTocIndex)

  return [
    content.slice(0, startTocIndex),
    content.slice(startTocIndex, endTocIndex),
    content.slice(endTocIndex),
  ]
}

function generateToc() {
  return readReadme()
    .split("\n")
    .flatMap((line) => {
      const level = line.match(/^#*/)[0].length
      if (!level) return []

      const title = line.slice(level + 1)
      const urlHash = title
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^-a-z0-9]/g, "")
      return `${"  ".repeat(level - 2)}- [${title}](#${urlHash})`
    })
    .join("\n")
}
