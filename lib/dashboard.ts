import axios from "axios";
import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { PackageObjectType } from "./models/info";

dotenv.config();

export class DashboardInstaller {
    argoPackage: PackageObjectType;
    packagePath: string;

    /**
     * Installs the dashboards for the package
     * @param {Package} argoPackage
     * @param {string} packagePath Argo package path
     */
    constructor(argoPackage: PackageObjectType, packagePath: string) {
        this.argoPackage = argoPackage;
        this.packagePath = packagePath;
    }

    install() {
        return this.installGrafanaDashboards();
    }

    /**
     * Install all grafana dashboards for the package
     * @returns
     */
    async installGrafanaDashboards() {
        const GRAFANA_URL = process.env.GRAFANA_URL;
        const GRAFANA_API_TOKEN = process.env.GRAFANA_API_TOKEN;

        if (!GRAFANA_URL || !GRAFANA_API_TOKEN) {
            console.log(`Grafana URL or API token is not set. Skipping dashboard installation.`);
            return Promise.resolve();
        }

        const dirPath = `${this.packagePath}/dashboards/grafana/`;
        if (!existsSync(dirPath)) {
            return Promise.resolve(true);
        }

        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GRAFANA_API_TOKEN}`,
        };

        const files = await readdir(dirPath);

        return files.map(async (fileName: string) => {
            if (!fileName || !fileName.endsWith(".json")) {
                return;
            }
            const data = await readFile(dirPath + fileName, { encoding: "utf8" });
            console.debug(`STARTING upload for ${fileName} - POST ${GRAFANA_URL}`);
            try {
                await axios.post(GRAFANA_URL, JSON.parse(data), { headers: headers });
                console.debug(`DONE Uploading ${fileName} - POST ${GRAFANA_URL}`);
            } catch (err) {
                if (err.isAxiosError) {
                    const message_1 = `FAILED Uploading ${fileName} - POST ${GRAFANA_URL}. HTTP Code: ${err.response.status}. ERROR: ${err.response.statusText}`;
                    console.error(message_1);
                    throw message_1;
                }
                throw err;
            }
        });
    }
}
