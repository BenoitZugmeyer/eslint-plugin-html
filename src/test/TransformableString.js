const TransformableString = require("../TransformableString")

const { it, describe } = require("node:test")
const assert = require("assert")

it("should be a function", () => {
  assert.strictEqual(typeof TransformableString, "function")
})

describe("toString", () => {
  it("should return the original string if no transform are made", () => {
    const ts = new TransformableString("foo")
    assert.strictEqual(ts.toString(), "foo")
  })
})

describe("replace", () => {
  it("should replace a slice", () => {
    const ts = new TransformableString("foo")
    ts.replace(1, 2, "OO")
    assert.strictEqual(ts.toString(), "fOOo")
  })

  it("should throw if trying to replace the same thing twice", () => {
    const ts = new TransformableString("abcd")
    ts.replace(1, 3, "OO")
    assert.throws(() => ts.replace(2, 4, "OO"))
    assert.throws(() => ts.replace(0, 2, "OO"))
  })

  it("should replace adjacent slices", () => {
    const ts = new TransformableString("abcde")
    ts.replace(2, 3, "OO")
    ts.replace(3, 4, "MM")
    ts.replace(1, 2, "NN")
    assert.strictEqual(ts.toString(), "aNNOOMMe")
  })
})

describe("originalIndex", () => {
  it("should return the same index if nothing changed", () => {
    const ts = new TransformableString("abcde")
    assert.strictEqual(ts.originalIndex(0), 0)
    assert.strictEqual(ts.originalIndex(1), 1)
    assert.strictEqual(ts.originalIndex(4), 4)
  })

  it("should throw if the index is invalid", () => {
    const ts = new TransformableString("abcde")
    assert.throws(() => ts.originalIndex(-1))
    assert.throws(() => ts.originalIndex(6))
  })

  it("should return the original index of a string with removed parts", () => {
    const ts = new TransformableString("abcde")
    ts.replace(1, 2, "")
    ts.replace(3, 4, "")
    assert.strictEqual(ts.toString(), "ace")
    assert.strictEqual(ts.originalIndex(0), 0) // a
    assert.strictEqual(ts.originalIndex(1), 2) // c
    assert.strictEqual(ts.originalIndex(2), 4) // e
    assert.strictEqual(ts.originalIndex(3), 5) // index directly after the end is allowed
    assert.throws(() => ts.originalIndex(4))
  })

  it("should return the original index of a string with added parts", () => {
    const ts = new TransformableString("ace")
    ts.replace(1, 1, "b")
    ts.replace(2, 2, "d")
    assert.strictEqual(ts.toString(), "abcde")
    assert.strictEqual(ts.originalIndex(0), 0) // a
    assert.strictEqual(ts.originalIndex(1), undefined)
    assert.strictEqual(ts.originalIndex(2), 1) // c
    assert.strictEqual(ts.originalIndex(3), undefined)
    assert.strictEqual(ts.originalIndex(4), 2) // e
    assert.strictEqual(ts.originalIndex(5), 3) // index directly after the end is allowed
    assert.throws(() => ts.originalIndex(6))
  })

  it("should return the original index of a string with added parts (2)", () => {
    const ts = new TransformableString("ab")
    ts.replace(1, 1, "XX")
    assert.strictEqual(ts.toString(), "aXXb")
    assert.strictEqual(ts.originalIndex(0), 0) // a
    assert.strictEqual(ts.originalIndex(1), undefined)
    assert.strictEqual(ts.originalIndex(2), undefined)
    assert.strictEqual(ts.originalIndex(3), 1) // b
  })

  it("should return the last index of the last block if the index is after the end", () => {
    const ts = new TransformableString("abcd")
    ts.replace(2, 4, "X")
    assert.strictEqual(ts.toString(), "abX")
    assert.strictEqual(ts.originalIndex(0), 0) // a
    assert.strictEqual(ts.originalIndex(1), 1) // b
    assert.strictEqual(ts.originalIndex(2), undefined)
    assert.strictEqual(ts.originalIndex(3), 3) // c
  })
})

describe("originalLocation", () => {
  it("should return the same location if nothing changed", () => {
    const ts = new TransformableString("aaaa\nbbbb\ncccc")
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 1,
      }),
      {
        line: 1,
        column: 1,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 3,
      }),
      {
        line: 1,
        column: 3,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 2,
        column: 1,
      }),
      {
        line: 2,
        column: 1,
      }
    )
  })

  it("should return the original location of a string with removed parts", () => {
    const ts = new TransformableString("aaaa\nbbbb\ncccc")
    ts.replace(3, 6, "")
    assert.strictEqual(ts.toString(), "aaabbb\ncccc")
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 1,
      }),
      {
        line: 1,
        column: 1,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 4,
      }),
      {
        line: 2,
        column: 2,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 2,
        column: 1,
      }),
      {
        line: 3,
        column: 1,
      }
    )
  })

  it("should return the original location of a string with added parts", () => {
    const ts = new TransformableString("aaaa\nbbbbcccc")
    ts.replace(9, 9, "X\nX")
    assert.strictEqual(ts.toString(), "aaaa\nbbbbX\nXcccc")
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 1,
      }),
      {
        line: 1,
        column: 1,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 1,
        column: 4,
      }),
      {
        line: 1,
        column: 4,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 2,
        column: 1,
      }),
      {
        line: 2,
        column: 1,
      }
    )
    assert.deepStrictEqual(
      ts.originalLocation({
        line: 2,
        column: 5,
      }),
      undefined
    )
  })
})

describe("getOriginalLine", () => {
  it("returns original lines", () => {
    const ts = new TransformableString("aa\nbb\r\ncc")
    assert.throws(() => ts.getOriginalLine(0))
    assert.deepStrictEqual(ts.getOriginalLine(1), "aa")
    assert.deepStrictEqual(ts.getOriginalLine(2), "bb")
    assert.deepStrictEqual(ts.getOriginalLine(3), "cc")
    assert.throws(() => ts.getOriginalLine(4))
  })
})
