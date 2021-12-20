const { uninstall } = require("../lib/index");
const { install, installGlobal } = require("../lib/install.js");
const { getPackageName, MOCK_PACKAGE_PATH, REGISTRY } = require("./test-utils");

describe.skip("simulate package install", () => {
    const namespace = "default";
    const cluster = false;

    afterEach(async () => {
        await uninstall(namespace, getPackageName(MOCK_PACKAGE_PATH), cluster).catch((err) => {
            console.error(err);
            throw err;
        });
    });

    it("must install local package", async () => {
        await install(".", REGISTRY, namespace, false, cluster, { force: false }, MOCK_PACKAGE_PATH)
            .then((packageName) => {
                console.log(`${packageName} installed`);
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
    });
});
