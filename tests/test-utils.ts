import { readFileSync } from "fs";
import { userInfo } from "os";

export const MOCK_PACKAGE_PATH = `${__dirname}/fixtures/mock-package`;

// TODO: use the username to ensure tests don't collide between different users of same cluster
export const USERNAME = userInfo().username;

export const REGISTRY = "https://packages.atlan.com";

export const getPackageName = (path: string) => {
    const packageJSONFilePath = `${path}/package.json`;
    const packageObject = JSON.parse(readFileSync(packageJSONFilePath, "utf-8"));
    return packageObject.name;
};
