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
     * @param {String} workflowControllerConfigMapName Name of the Workflow controller configmap in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh workflow controller configmap exists
     * @param {String} package Package info
     */
    constructor(workflowControllerConfigMapName, argoNamespace, packageConfig) {
        this.workflowControllerConfigMapName = workflowControllerConfigMapName;
        this.argoNamespace = argoNamespace;
        this.package = packageConfig;
    }

    initialize() {
        return this.getS3ConfigFromArgo(this.workflowControllerConfigMapName, this.argoNamespace).then(
            ({ bucket, region }) => {
                this.client = new S3Client({ region: region });
                this.bucketName = bucket;
                this.s3KeyPrefix = `argo-artifacts/argopm/${this.package.name}/${this.package.rawSpec}/static`;
            }
        );
    }

    /**
     * Fetch the workflow controller configmap and return the artifactory (S3) bucket name and region
     *
     * @param {String} workflowControllerConfigMapName Name of the Workflow controller configmap in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh workflow controller configmap exists
     */
    getS3ConfigFromArgo(workflowControllerConfigMapName, argoNamespace) {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();

        const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

        return coreK8sApi
            .readNamespacedConfigMap(workflowControllerConfigMapName, argoNamespace)
            .then((argoWorkflowControllerConfigMap) => {
                const configMap = yaml.load(argoWorkflowControllerConfigMap.body.data.config);
                return {
                    bucket: configMap.artifactRepository.s3.bucket,
                    region: configMap.artifactRepository.s3.region,
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
        console.log(`Uploading to S3: ${path}`);

        const fileContent = fs.readFileSync(path, {
            encoding: "utf-8",
            flag: "r",
        });

        const params = {
            Bucket: this.bucketName,
            Key: `${this.s3KeyPrefix}/${path.split("static/").at(-1)}`,
            Body: fileContent,
        };

        this.client.send(new PutObjectCommand(params)).catch((err) => {
            throw err;
        });
    }

    /**
     * Accepts a directory path and recursively uploads all the files in the `static` folder
     *
     * @param {String} dirPath Absolute path of the directory
     */
    uploadStaticFiles(dirPath) {
        return walk(`${dirPath}/static`)
            .then((dirs) => {
                Promise.all(dirs.map((dir) => this.uploadFile(dir)));
            })
            .catch((err) => {
                if (err.code !== "ENOENT") {
                    throw err;
                } else {
                    return;
                }
            });
    }
}

exports.S3 = S3;
