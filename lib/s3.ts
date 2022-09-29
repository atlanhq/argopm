import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";
import { load } from "js-yaml";
import { readFileSync } from "node:fs";
import { Result } from "npm-package-arg";
import { walk } from "./utils";

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
            const bucket: string = load(argoWorkflowControllerConfigMap.body.data["bucket"]) as string;
            const region: string = load(argoWorkflowControllerConfigMap.body.data["region"]) as string;
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
     * @param  {string} path
     */
    async uploadFile(path: string) {
        const fileContent = readFileSync(path, {
            encoding: "utf-8",
            flag: "r",
        });

        if (fileContent.length === 0) {
            return Promise.resolve();
        }

        const pathSplit = path.split("static/");
        console.log(`${this.s3KeyPrefix}/${pathSplit[pathSplit.length - 1]}`);
        const key = `${this.s3KeyPrefix}/${pathSplit[pathSplit.length - 1]}`;
        console.log(`Uploading file: ${path} to ${key}`);
        const params = {
            Bucket: this.bucketName,
            Key: key,
            Body: fileContent,
        };

        return await this.client.send(new PutObjectCommand(params));
    }

    /**
     * Accepts a directory path and recursively uploads all the files in the `static` folder
     *
     * @param {string} dirPath Absolute path of the directory
     */
    async uploadStaticFiles(dirPath: string) {
        const dirs = await walk(`${dirPath}/static`).filter((dir: string) => !dir.endsWith(".md"));
        return await Promise.all(dirs.map((dir: any) => this.uploadFile(dir))).catch((err) => {
            if (err.code !== "ENOENT") {
                throw err;
            }
        });
    }
}
