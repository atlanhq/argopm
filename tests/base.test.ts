import { install } from "../lib/install.mjs";
import { MOCK_PACKAGE_PATH, REGISTRY } from "./test-utils";

describe("simulate package install", () => {
    const namespace = "default";
    const cluster = false;

    afterEach(async () => {
        // await uninstall(namespace, getPackageName(MOCK_PACKAGE_PATH), cluster).catch((err) => {
        //     console.error(err);
        // });
    });

    it("must install local package", async () => {
        let result: boolean;
        try {
            await install(".", REGISTRY, namespace, false, cluster, { force: false }, MOCK_PACKAGE_PATH);
            console.log(`Argopm finished installing package`);
            result = true;
        } catch (err) {
            console.error(err);
            throw err;
        }
        expect(result).toBeTruthy();
    });
});
