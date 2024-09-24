const S3Client = require("@aws-sdk/client-s3").S3Client;
const PutObjectCommand = require("@aws-sdk/client-s3").PutObjectCommand;
const Promise = require("bluebird");
const yaml = require("js-yaml");
const walk = require("./utils").walk;
const k8s = require("@kubernetes/client-node");
const fs = require("fs");

class S3 {
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

    initialize() {
        return this.getS3ConfigFromArgo(this.configMapName, this.argoNamespace)
            .then(({ bucket, region }) => {
                this.client = new S3Client({ region: region });
                this.bucketName = bucket;
                this.s3KeyPrefix = `argo-artifacts/argopm/${this.package.name}/latest/static`;
            })
            .catch((err) => {
                console.error("Erorr while initializing client");
                console.error(err);
                this.client = null;
                this.bucketName = null;
                this.s3KeyPrefix = null;
            });
    }

    /**
     * Fetch the workflow controller configmap and return the artifactory (S3) bucket name and region
     *
     * @param {String} configMapName Name of the configmap with bucket and region data in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh workflow controller configmap exists
     */
    getS3ConfigFromArgo(configMapName, argoNamespace) {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();

        const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

        return coreK8sApi
            .readNamespacedConfigMap(configMapName, argoNamespace)
            .then((argoWorkflowControllerConfigMap) => {
                const bucket = yaml.load(argoWorkflowControllerConfigMap.body.data.bucket);
                const region = yaml.load(argoWorkflowControllerConfigMap.body.data.region);

                return {
                    bucket,
                    region,
                };
            })
            .catch((err) => {
                throw err;
            });
    }

    /**
     * Upload a given file to S3
     *
     * @param {String} path Absolute path of file
     */
    uploadFile(path) {
        if (this.client === null) {
            console.log("Skipping upload file due to missing client");
            return Promise.resolve();
        }
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
        if (this.client === null) {
            console.log("Skipping upload file due to missing client");
            return Promise.resolve();
        }
        return walk(`${dirPath}/static`)
            .then((dirs) => {
                dirs = dirs.filter((dir) => !dir.endsWith(".md"));
                return Promise.all(dirs.map((dir) => this.uploadFile(dir)));
            })
            .catch((err) => {
                if (err.code !== "ENOENT") {
                    throw err;
                }
                return;
            });
    }
}

exports.S3 = S3;
