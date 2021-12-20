const { uninstall } = require("../lib/index");
const { install, installGlobal } = require("../lib/install.js");
const { getPackageName, MOCK_PACKAGE_PATH, REGISTRY } = require("./test-utils");

describe("simulate package install", () => {
    const namespace = "default";
    const cluster = false;

    afterEach(async () => {
        // await uninstall(namespace, getPackageName(MOCK_PACKAGE_PATH), cluster).catch((err) => {
        //     console.error(err);
        // });
    });

    it("must install local package", async () => {
        const result = await install(".", REGISTRY, namespace, false, cluster, { force: false }, MOCK_PACKAGE_PATH)
            .then(() => {
                console.log(`Argopm finished installing package`);
                return true;
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
        expect(result).toBeTruthy();
    });
});
