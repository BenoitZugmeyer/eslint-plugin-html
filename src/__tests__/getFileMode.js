const { test } = require("node:test")
const assert = require("assert")
function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected)
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected)
    },
    toMatch(expected) {
      assert.match(actual, expected)
    },
    toThrow(callback) {
      let error = null
      try {
        callback()
      } catch (e) {
        error = e
      }
      assert.notStrictEqual(error, null)
    },
  }
}

const getFileMode = require("../getFileMode")

test("undefined if filename is empty", () => {
  expect(
    getFileMode({ htmlExtensions: [], xmlExtensions: [] }, undefined)
  ).toBe(undefined)
})

test("'html' if filename matches an HTML extension", () => {
  expect(
    getFileMode({ htmlExtensions: ["html"], xmlExtensions: [] }, "foo.html")
  ).toBe("html")
})

test("'html' if filename matches an HTML and an XML extension", () => {
  expect(
    getFileMode(
      { htmlExtensions: ["html"], xmlExtensions: ["html"] },
      "foo.html"
    )
  ).toBe("html")
})

test("'xml' if filename matches an XML extension", () => {
  expect(
    getFileMode({ htmlExtensions: ["html"], xmlExtensions: ["xml"] }, "foo.xml")
  ).toBe("xml")
})

test("undefined if filename ends with extension without dot", () => {
  expect(
    getFileMode({ htmlExtensions: [], xmlExtensions: ["xml"] }, "fooxml")
  ).toBe(undefined)
})

test("works with extensions starting with a dot", () => {
  expect(
    getFileMode({ htmlExtensions: [".html"], xmlExtensions: [] }, "foo.html")
  ).toBe("html")
})

test("works with extensions containgin a dot", () => {
  expect(
    getFileMode(
      { htmlExtensions: [".html.in"], xmlExtensions: [] },
      "foo.html.in"
    )
  ).toBe("html")
})
