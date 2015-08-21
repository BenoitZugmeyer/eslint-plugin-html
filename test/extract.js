"use strict";
var assert = require("assert");
var extract = require("../src/extract");

function assertExtract(html, code, map) {
  var infos = extract(html);
  assert.equal(infos.code, code);
  assert.deepEqual(infos.map, map);
}

function s() {
  return [].join.call(arguments, "\n");
}

describe("extract", function () {
  it("extract simple javascript", function () {
    assertExtract(
      s(
        "some html",
        "<script>var foo = 1;</script>",
        "other"
      ),
      s(
        "",
        "var foo = 1;"
      ),
      [ { line: 2, column: 0 } ]
    );
  });

  it("extract indented javascript", function () {
    assertExtract(
      s(
        "some html",
        "<script>",
        "  var foo = 1;",
        "</script>",
        "other"
      ),
      s(
        "",
        "",
        "var foo = 1;",
        ""
      ),
      [ { line: 4, column: 2 } ]
    );
  });

  it("extract javascript with first line next to the script tag", function () {
    assertExtract(
      s(
        "some html",
        "<script>var foo = 1;",
        "  var baz = 1;",
        "</script>",
        "other"
      ),
      s(
        "",
        "var foo = 1;",
        "  var baz = 1;",
        ""
      ),
      [ { line: 4, column: 0 } ]
    );
  });

  it("extract javascript with last line next to the script tag", function () {
    assertExtract(
      s(
        "some html",
        "<script>",
        "  var foo = 1;",
        "  var baz = 1;</script>",
        "other"
      ),
      s(
        "",
        "",
        "var foo = 1;",
        "var baz = 1;"
      ),
      [ { line: 4, column: 2 } ]
    );
  });

  it("extract multiple script tags", function () {
    assertExtract(
      s(
        "some html",
        "<script>",
        "  var foo = 1;",
        "</script>",
        "other",
        "<script>",
        "  var bar = 1;",
        "</script>"
      ),
      s(
        "",
        "",
        "var foo = 1;",
        "",
        "",
        "",
        "var bar = 1;",
        ""
      ),
      [ { line: 4, column: 2 },
        { line: 8, column: 2 } ]
    );
  });

  it("trim last line spaces", function () {
    assertExtract(
      s(
        "some html",
        "  <script>",
        "    var foo = 1;",
        "  </script>",
        "other"
      ),
      s(
        "",
        "",
        "var foo = 1;",
        ""
      ),
      [ { line: 4, column: 4 } ]
    );
  });

  it("extract script containing 'lower than' characters correctly (#1)", function () {
    assertExtract(
      s(
        "<script>",
        "  if (a < b) { doit(); }",
        "</script>"
      ),
      s(
        "",
        "if (a < b) { doit(); }",
        ""
      ),
      [ { line: 3, column: 2 } ]
    );
  });


  it("extract empty script tag (#7)", function () {
    assertExtract(
      s(
        "<script></script>"
      ),
      s(
        ""
      ),
      [ ]
    );
  });
});
