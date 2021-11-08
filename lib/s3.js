const S3Client = require("@aws-sdk/client-s3").S3Client;
const PutObjectCommand = require("@aws-sdk/client-s3").PutObjectCommand;
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
     * @param {String} packageName Name of the package
     */
    constructor(workflowControllerConfigMapName, argoNamespace, packageName) {
        this.workflowControllerConfigMapName = workflowControllerConfigMapName;
        this.argoNamespace = argoNamespace;
        this.packageName = packageName.split("@").at(-2);
        this.version = packageName.split("@").at(-1);
    }

    async initialize() {
        const { bucket, region } = await this.getS3ConfigFromArgo(
            this.workflowControllerConfigMapName,
            this.argoNamespace
        );

        this.client = new S3Client({ region: region });
        this.bucketName = bucket;
        this.s3KeyPrefix = `argo-artifacts/argopm/${this.packageName}/${this.version}/static`;
    }

    /**
     * Fetch the workflow controller configmap and return the artifactory (S3) bucket name and region 
     *
     * @param {String} workflowControllerConfigMapName Name of the Workflow controller configmap in the Argo instance
     * @param {String} argoNamespace K8s namespace where theh workflow controller configmap exists
     */
    async getS3ConfigFromArgo(workflowControllerConfigMapName, argoNamespace) {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();

        const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

        try {
            const argoWorkflowControllerConfigMap = await coreK8sApi.readNamespacedConfigMap(
                workflowControllerConfigMapName,
                argoNamespace
            );
            const configMap = yaml.load(argoWorkflowControllerConfigMap.body.data.config);

            return {
                bucket: configMap.artifactRepository.s3.bucket,
                region: configMap.artifactRepository.s3.region,
            };
        } catch (err) {
            throw err;
        }
    }

    /**
     * Upload a given file to S3
     *
     * @param {String} path Absolute path of file
     */
    async uploadFile(path) {
        console.log(`Uploading to S3: ${path}`);

        const fileContent = fs.readFileSync(path, {
            encoding: "utf-8",
            flag: "r",
        });

        try {
            const params = {
                Bucket: this.bucketName,
                Key: `${this.s3KeyPrefix}/${path.split("static/").at(-1)}`,
                Body: fileContent,
            };

            await this.client.send(new PutObjectCommand(params));
        } catch (err) {
            throw err;
        }
    }

     /**
     * Accepts a directory path and recursively uploads all the files in the `static` folder
     *
     * @param {String} dirPath Absolute path of the directory
     */ 
    async uploadStaticFiles(dirPath) {
        try {
            const dirs = await walk(`${dirPath}/static`);
            await Promise.all(dirs.map((dir) => this.uploadFile(dir)));
        } catch (err) {
            return;
        }
    }
}

exports.S3 = S3;
