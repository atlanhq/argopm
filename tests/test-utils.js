const fs = require("fs");
const os = require("os");

module.exports = {
    MOCK_PACKAGE_PATH: __dirname + "/fixtures/mock-package",
    // TODO: use the username to ensure tests don't collide between different users of same cluster
    USERNAME: os.userInfo().username,
    REGISTRY: "https://packages.atlan.com",

    getPackageName: function (path) {
        const packageJSONFilePath = `${path}/package.json`;
        const packageObject = JSON.parse(fs.readFileSync(packageJSONFilePath, "utf-8"));
        return packageObject.name;
    },
};
