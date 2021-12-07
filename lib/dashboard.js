"use strict";

const { Package } = require("./models/package");
const axios = require('axios');

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

        const dirPath = `${this.packagePath}/dashboards/grafana/`
        if (!fs.existsSync(dirPath)) {
            return Promise.resolve(true);
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GRAFANA_API_TOKEN}`,
        }
          
        var mainThis = this;
        return fs.readdirAsync(dirPath).then(files => {
            return Promise.all(files.map(file => {
                return fs.readFileAsync(filePath, 'utf8').then(data => { 
                    return axios.post(GRAFANA_URL, data, { headers: headers });
                });
            }));
        })
    }
}

exports.DashboardInstaller = DashboardInstaller;