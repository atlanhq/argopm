const { uninstall } = require("../lib/index");
const { install, installGlobal } = require("../lib/install.js");
const { getPackageName, MOCK_PACKAGE_PATH, REGISTRY } = require("./test-utils");
const { k8s } = require("../lib/k8s.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe.skip("simulate package install", () => {
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

describe("verify export-package-names", () => {
    test("verify content", async () => {
        const namespace = "default";
        const cluster = false;

        const currentTime = Date.now();
        const tempDir = os.tmpdir();
        const filePath = path.join(tempDir, `${currentTime}.txt`);

        const result = await install(
            ".",
            REGISTRY,
            namespace,
            false,
            cluster,
            { preview: true, exportPackageNameFilePath: filePath },
            MOCK_PACKAGE_PATH
        )
            .then(() => {
                return true;
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
        expect(result).toBeTruthy();
        const data = fs.readFileSync(filePath, "utf8");
        expect(data).toEqual("@atlan/mock-package-delete-me");
    });
});
