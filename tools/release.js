"use strict"
const { execSync: exec } = require("child_process")
const { readFileSync: read } = require("fs")
const { request } = require("https")

const REPO = "BenoitZugmeyer/eslint-plugin-html"
const PACKAGE_FILES = [
  "LICENSE",
  "src/extract.js",
  "src/getFileMode.js",
  "src/index.js",
  "src/settings.js",
  "src/TransformableString.js",
  "src/utils.js",
  "package.json",
  "CHANGELOG.md",
  "README.md",
]

main().catch((error) => {
  console.log(error)
  process.exitCode = 1
})

async function main() {
  const [version, channel] = getVersion()
  verifyPackageContent()
  runTests()
  createVersion(version)
  await verifyBuild()
  releaseVersion(version, channel)
  console.log("Release successful!")
}

function error(message) {
  console.error(message)
  process.exit(1)
}

function getVersion() {
  console.log("Get version...")

  // Verify repository status
  if (exec("git status --porcelain").length) {
    error("Repository should be clean")
  }

  const matches = read("CHANGELOG.md")
    .toString()
    .match(
      /^(\d{4}-\d{2}-\d{2}) v(\d+\.\d+\.\d+(?:-([a-z]+)\.\d+)?)(?: - .+)?$/m
    )

  if (!matches) {
    error("Invalid changelog format")
  }

  const [_, date, version, channel = "latest"] = matches
  if (date !== new Date().toISOString().slice(0, 10)) {
    error("Invalid changelog date")
  }

  return [version, channel]
}

function runTests() {
  console.log("Running tests...")
  exec("npm run --silent test", { stdio: "inherit" })
  exec("npm run --silent lint", { stdio: "inherit" })
}

function verifyPackageContent() {
  console.log("Verify package content...")
  const packed = exec("npm pack --dry-run 2>&1").toString().split("\n")

  const STATE_INIT = 0
  const STATE_TARBALL_CONTENTS = 1
  const STATE_TARBALL_DETAILS = 2

  let state = STATE_INIT
  const content = new Set()

  for (let line of packed) {
    line = line.replace(/^npm notice /, "").trim()
    switch (state) {
      case STATE_INIT:
        if (line === "=== Tarball Contents ===") {
          state = STATE_TARBALL_CONTENTS
        }
        break
      case STATE_TARBALL_CONTENTS:
        if (line === "=== Tarball Details ===") {
          state = STATE_TARBALL_DETAILS
        } else {
          content.add(line.match(/.*?\s+(.*)$/)[1])
        }
        break
    }
  }

  const expectedContent = new Set(PACKAGE_FILES)

  for (const file of expectedContent) {
    if (!content.has(file)) error(`Missing ${file} in package content`)
  }
  for (const file of content) {
    if (!expectedContent.has(file))
      error(`Unexpected ${file} in package content`)
  }
}

function createVersion(version) {
  console.log(`Creating version ${version}`)

  exec(`npm version ${version}`, {
    stdio: "inherit",
  })

  exec("git push --no-follow-tags", {
    stdio: "inherit",
  })
}

async function verifyBuild() {
  const sha = exec("git rev-parse HEAD").toString().trim()
  while (true) {
    const { workflow_runs: runs } = await fetchWorkflowRuns()
    const run = runs.find((commit) => commit.head_sha === sha)
    if (!run) {
      console.log("Workflow run not found yet...")
    } else {
      if (run.status === "completed") {
        if (run.conclusion !== "success") {
          error(`Workflow run ${run.html_url} finished as ${run.conclusion}`)
        } else {
          return
        }
      } else {
        console.log(`Workflow run ${run.html_url} ${run.status}`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}

function fetchWorkflowRuns() {
  return new Promise((resolve, reject) => {
    const req = request(
      `https://api.github.com/repos/${REPO}/actions/runs?event=push&branch=main`,
      {
        headers: {
          "User-Agent": "release-script/1.0.0",
        },
      }
    )
    req.on("error", reject)
    req.on("response", (response) => {
      const datum = []
      response.on("error", reject)
      response.on("data", (data) => datum.push(data))
      response.on("end", () => {
        resolve(JSON.parse(Buffer.concat(datum)))
      })
    })
    req.end()
  })
}

function releaseVersion(version, channel) {
  console.log(`Publishing ${version} to channel ${channel}`)

  exec(`npm publish --tag ${channel}`, {
    stdio: "inherit",
  })
  exec("git push --tags", {
    stdio: "inherit",
  })
}
