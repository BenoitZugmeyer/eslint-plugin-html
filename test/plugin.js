var assert = require("assert");
var path = require("path");
var CLIEngine = require("eslint").CLIEngine;
var plugin = require("..");

function execute(file, settings) {
  var cli = new CLIEngine({
    extensions: ["html"],
    baseConfig: {
      settings: settings,
      rules: {
        "no-console": 2,
      },
    },
    ignore: false,
    useEslintrc: false,
  });
  cli.addPlugin("html", plugin);
  return cli.executeOnFiles([path.join(__dirname, "fixtures", file)]).results[0].messages;
}



describe("plugin", function () {

  it("should extract and remap messages", function () {
    var messages = execute("simple.html");

    assert.equal(messages.length, 5);

    assert.equal(messages[0].message, "Unexpected console statement.");
    assert.equal(messages[0].line, 8);
    assert.equal(messages[0].column, 7);

    assert.equal(messages[1].message, "Unexpected console statement.");
    assert.equal(messages[1].line, 14);
    assert.equal(messages[1].column, 7);

    assert.equal(messages[2].message, "Unexpected console statement.");
    assert.equal(messages[2].line, 20);
    assert.equal(messages[2].column, 3);

    assert.equal(messages[3].message, "Unexpected console statement.");
    assert.equal(messages[3].line, 25);
    assert.equal(messages[3].column, 11);

    assert.equal(messages[4].message, "Unexpected console statement.");
    assert.equal(messages[4].line, 28);
    assert.equal(messages[4].column, 13);
  });

});
