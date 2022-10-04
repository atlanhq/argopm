import { PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";
import { yellow } from "ansicolor";
import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import { Result } from "npm-package-arg";
import { walk } from "./utils.mjs";

export class S3 {
    configMapName: string;
    argoNamespace: string;
    package: Result;
    client: S3Client;
    bucketName: string;
    s3KeyPrefix: string;

    /**
     * Provides functionality to upload files in the `static` sub directory to AWS S3
     *
     * @param {string} configMapName Name of the configmap with bucket and region data in the Argo instance
     * @param {string} argoNamespace K8s namespace where theh configmap exists
     * @param {string} package Package info
     */
    constructor(configMapName: string, argoNamespace: string, packageConfig: Result) {
        this.configMapName = configMapName;
        this.argoNamespace = argoNamespace;
        this.package = packageConfig;
    }
    /**
     * Initialize S3 client with configs from the S3 Config from Argo.
     */
    async initialize() {
        const { bucket, region } = await this.getS3ConfigFromArgo(this.configMapName, this.argoNamespace);
        if (bucket && region) {
            this.client = new S3Client({ region: region });
            this.bucketName = bucket;
            this.s3KeyPrefix = `argo-artifacts/argopm/${this.package.name}/latest/static`;
        } else {
            console.error("Cannot initialize, missing bucket and/or region.");
        }
    }

    /**
     * Fetch the workflow controller configmap and return the artifactory (S3) bucket name and region
     *
     * @param {string} configMapName Name of the configmap with bucket and region data in the Argo instance
     * @param {string} argoNamespace K8s namespace where theh workflow controller configmap exists
     */
    async getS3ConfigFromArgo(configMapName: string, argoNamespace: string) {
        const kc = new KubeConfig();
        kc.loadFromDefault();

        const coreK8sApi = kc.makeApiClient(CoreV1Api);
        const argoWorkflowControllerConfigMap = await coreK8sApi.readNamespacedConfigMap(configMapName, argoNamespace);
        if (argoWorkflowControllerConfigMap.body.data) {
            const bucket: string = argoWorkflowControllerConfigMap.body.data["bucket"];
            const region: string = argoWorkflowControllerConfigMap.body.data["region"];
            return {
                bucket,
                region,
            };
        } else {
            return { bucket: undefined, region: undefined };
        }
    }

    /**
     * Upload a given file to S3
     *
     * @param {String} path Absolute path of file
     */
    async uploadFile(path) {
        const fileContent = readFileSync(path, {
            encoding: "utf-8",
            flag: "r",
        });

        if (fileContent.length > 0) {
            const pathSplit = path.split("static/");
            const key = `${this.s3KeyPrefix}/${pathSplit[pathSplit.length - 1]}`;

            console.log(`Uploading file: ${path} to ${key}`);

            return await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                    Body: fileContent,
                })
            );
        }
    }

    /**
     * Accepts a directory path and recursively uploads all the files in the `static` folder
     *
     * @param {String} dirPath Absolute path of the directory
     */
    async uploadStaticFiles(dirPath) {
        if (existsSync(`${dirPath}/static`)) {
            let dirs = await walk(`${dirPath}/static`);
            dirs = dirs.filter((dir) => !dir.endsWith(".md"));
            await Promise.all(dirs.map((dir) => this.uploadFile(dir)));
        } else {
            console.log(yellow(`No "static" dir under ${dirPath}.`));
        }
    }
}
