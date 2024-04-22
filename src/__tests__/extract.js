/*eslint no-sparse-arrays: 0*/
const { it, describe } = require("node:test")
const assert = require("assert")

const extract = require("../extract")

function dedent(str) {
  if (str[0] === "\n") str = str.slice(1)

  const indent = str.match(/([\t ]*)\S/)
  if (indent) {
    str = str.replace(new RegExp(`^${indent[1]}`, "mg"), "")

    if (indent[1].endsWith("  ")) {
      // Remove the last line indentation (under-indented by 2 spaces)
      str = str.replace(new RegExp(`${indent[1].slice(0, -2)}$`), "")
    }
  }

  return str
}

function test(params) {
  const infos = extract(dedent(params.input), params.xmlMode, {
    indent: params.indent,
    javaScriptTagNames: params.javaScriptTagNames || ["script"],
    isJavaScriptMIMEType: params.isJavaScriptMIMEType,
    ignoreTagsWithoutType: params.ignoreTagsWithoutType,
  })
  assert.deepStrictEqual(
    infos.code.map((code) => code.toString()),
    params.expected
  )
  assert.deepStrictEqual(
    infos.badIndentationLines,
    params.badIndentationLines || []
  )
}

it("extract simple javascript", () => {
  test({
    input: `
      some html
      <script>var foo = 1;</script>
      other
    `,
    expected: ["var foo = 1;"],
  })
})

it("extract indented javascript", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
      </script>
      other
    `,
    expected: ["var foo = 1;\n"],
  })
})

it("extract javascript with first line next to the script tag", () => {
  test({
    input: `
      some html
      <script>var foo = 1;
        var baz = 1;
      </script>
      other
    `,
    expected: ["var foo = 1;\nvar baz = 1;\n"],
  })
})

it("extract javascript with last line next to the script tag", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
        var baz = 1;</script>
      other
    `,
    expected: ["var foo = 1;\nvar baz = 1;"],
  })
})

it("extract multiple script tags", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
      </script>
      other
      <script>
        var bar = 1;
      </script>
    `,
    expected: ["var foo = 1;\n", "var bar = 1;\n"],
  })
})

it("trim last line spaces", () => {
  test({
    input: `
      some html
        <script>
          var foo = 1;
        </script>
      other
    `,
    expected: ["var foo = 1;\n"],
  })
})

it("trim last line spaces ignoring CDATA", () => {
  test({
    input: `
      some html
        <script><![CDATA[
          var foo = 1;
        ]]></script>
      other
    `,
    xmlMode: true,
    expected: ["\nvar foo = 1;\n"],
  })
})

it("extract script containing 'lower than' characters correctly (#1)", () => {
  test({
    input: `
      <script>
        if (a < b) { doit(); }
      </script>
    `,
    expected: ["if (a < b) { doit(); }\n"],
  })
})

it("extract empty script tag (#7)", () => {
  test({
    input: `
      <script></script>
    `,
    expected: [""],
  })
})

const prefixes = ["text/", "text/x-", "application/", "application/x-"]

const types = ["javascript", "babel"]

for (const prefix of prefixes) {
  for (const type of types) {
    const tag = `${prefix}${type}`

    it(`extracts a script tag with type=${tag}`, () => {
      test({
        input: `
          some html
          <script type="${tag}">var foo = 1;</script>
          other
        `,
        expected: ["var foo = 1;"],
      })
    })
  }
}

it("collects bad indentations", () => {
  test({
    input: `
      <script>
        a;
      a;
       a;
      </script>
    `,
    badIndentationLines: [3, 4],
    expected: ["a;\na;\n a;\n"],
  })
})

describe("indent option", () => {
  it("absolute indent with spaces", () => {
    test({
      input: `
        <head>
          <script>
            a;
          a;
        a;
          </script>
        </head>
      `,
      indent: {
        spaces: "  ",
      },
      badIndentationLines: [3, 5],
      expected: ["\n    a;\na;\na;\n"],
    })
  })

  it("relative indent with spaces", () => {
    test({
      input: `
        <head>
          <script>
            a;
          a;
        a;
          </script>
        </head>
      `,
      indent: {
        spaces: "  ",
        relative: true,
      },
      badIndentationLines: [4, 5],
      expected: ["a;\n  a;\na;\n"],
    })
  })

  it("absolute indent with tabs", () => {
    test({
      input: `
        <head>
        \t<script>
        \t\ta;
        \ta;
        a;
        \t</script>
        </head>
      `,
      indent: {
        spaces: "\t",
      },
      badIndentationLines: [3, 5],
      expected: ["\n\t\ta;\na;\na;\n"],
    })
  })

  it("relative indent with tabs", () => {
    test({
      input: `
        <head>
        \t<script>
        \t\ta;
        \ta;
        a;
        \t</script>
        </head>
      `,
      indent: {
        spaces: "\t",
        relative: true,
      },
      badIndentationLines: [4, 5],
      expected: ["a;\n\ta;\na;\n"],
    })
  })
})

it("works with crlf new lines", () => {
  test({
    input:
      "<p>\r\n</p>\r\n<script>\r\n  foo;\r\nbar;\r\n    baz;\r\n</script>\r\n",
    badIndentationLines: [5],
    expected: ["foo;\r\nbar;\r\n  baz;\r\n"],
  })
})

it("works with CDATA", () => {
  test({
    input: `
    <script>
      a;
      <![CDATA[
      b;
      ]]>
      c;
    </script>`,
    xmlMode: true,
    expected: ["a;\n\nb;\n\nc;\n"],
  })
})

it("handles the isJavaScriptMIMEType option", () => {
  test({
    input: `
    <script>
      a
    </script>

    <script type="foo/bar">
      b
    </script>

    <script type="foo/baz">
      c
    </script>
    `,
    isJavaScriptMIMEType(type) {
      return type === "foo/bar"
    },
    expected: ["a\n", "b\n"],
  })
})

it("keeps empty lines after the last html tags", () => {
  test({
    input: `
    <script>
      a
    </script>


    `,
    expected: ["a\n"],
  })
})

it("handles empty input", () => {
  test({
    input: "",
    expected: [],
  })
})

it("handles self closing script tags in xhtml mode", () => {
  test({
    input: "a <script /> b",
    xmlMode: true,
    expected: [],
  })
})

it("skips script with src attributes", () => {
  test({
    input: '<script src="foo"></script>',
    expected: [],
  })
})

it("skips script without type attribute", () => {
  test({
    input: "<script></script>",
    ignoreTagsWithoutType: true,
    expected: [],
  })
})

it("extract multiple tags types", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
      </script>
      other
      <customscript>
        var bar = 1;
      </customscript>
    `,
    javaScriptTagNames: ["script", "customscript"],
    expected: ["var foo = 1;\n", "var bar = 1;\n"],
  })
})

describe("disable comments", () => {
  it("ignores next script", () => {
    test({
      input: `
      <!-- eslint-disable-next-script -->
      <script>
        var foo = 1;
      </script>

      <script>
        var bar = 2;
      </script>
      `,
      expected: ["var bar = 2;\n"],
    })
  })

  it("ignores script", () => {
    test({
      input: `
      <!-- eslint-disable -->
      <script>
        var foo = 1;
      </script>
      <!-- eslint-enable -->
      <script>
        var bar = 2;
      </script>
      `,
      expected: ["var bar = 2;\n"],
    })
  })
})
