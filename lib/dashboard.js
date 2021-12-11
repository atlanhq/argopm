"use strict";

const { Package } = require("./models/package");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

class DashboardInstaller {
    /**
     * Installs the dashboards for the package
     * @param {Package} argoPackage
     * @param {String} packagePath Argo package path
     */
    constructor(argoPackage, packagePath) {
        this.argoPackage = argoPackage;
        this.packagePath = packagePath;
    }

    install() {
        return this.installGrafanaDashboards();
    }

    /**
     * Install all grafana dashboards for the package
     * @returns {Promise<void>}
     */
    installGrafanaDashboards() {
        const GRAFANA_URL = process.env.GRAFANA_URL;
        const GRAFANA_API_TOKEN = process.env.GRAFANA_API_TOKEN;

        if (!GRAFANA_URL || !GRAFANA_API_TOKEN) {
            console.log(`Grafana URL or API token is not set. Skipping dashboard installation.`);
            return Promise.resolve();
        }

        const dirPath = `${this.packagePath}/dashboards/grafana/`;
        if (!fs.existsSync(dirPath)) {
            return Promise.resolve(true);
        }

        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GRAFANA_API_TOKEN}`,
        };

        return fs.readdirAsync(dirPath).then((files) => {
            return Promise.all(
                files.map((fileName) => {
                    return fs.readFileAsync(dirPath + fileName, "utf8").then((data) => {
                        console.log(`Uploading ${fileName} - POST ${GRAFANA_URL}`);
                        return axios.post(GRAFANA_URL, JSON.parse(data), { headers: headers }).catch((err) => {
                            console.log(err)
                        });
                    });
                })
            );
        });
    }
}

exports.DashboardInstaller = DashboardInstaller;
