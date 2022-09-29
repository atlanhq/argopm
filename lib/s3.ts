import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import yaml from "js-yaml";
import { walk } from "./utils";
import k8s from "@kubernetes/client-node";
import fs from "fs";

export class S3 {
    configMapName: string;
    argoNamespace: string;
    package: any;
    client: S3Client;
    bucketName: string;
    s3KeyPrefix: string;

    /**
     * Provides functionality to upload files in the `static` sub directory to AWS S3
     *
     * @param {String} configMapName Name of the configmap with bucket and region data in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh configmap exists
     * @param {String} package Package info
     */
    constructor(configMapName, argoNamespace, packageConfig) {
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
     * @param {String} configMapName Name of the configmap with bucket and region data in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh workflow controller configmap exists
     */
    async getS3ConfigFromArgo(configMapName, argoNamespace) {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();

        const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);
        const argoWorkflowControllerConfigMap = await coreK8sApi.readNamespacedConfigMap(configMapName, argoNamespace);
        if (argoWorkflowControllerConfigMap.body.data) {
            const bucket: string = yaml.load(argoWorkflowControllerConfigMap.body.data["bucket"]) as string;
            const region: string = yaml.load(argoWorkflowControllerConfigMap.body.data["region"]) as string;
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
    uploadFile(path) {
        const fileContent = fs.readFileSync(path, {
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

        return this.client.send(new PutObjectCommand(params)).catch((err) => {
            throw err;
        });
    }

    /**
     * Accepts a directory path and recursively uploads all the files in the `static` folder
     *
     * @param {String} dirPath Absolute path of the directory
     */
    uploadStaticFiles(dirPath) {
        try {
            const dirs = walk(`${dirPath}/static`).filter((dir) => !dir.endsWith(".md"));
            return dirs.map((dir) => this.uploadFile(dir));
        } catch (err) {
            if (err.code !== "ENOENT") {
                throw err;
            }
            return;
        }
    }
}

exports.S3 = S3;
