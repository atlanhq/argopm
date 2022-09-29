import { Package } from "./models/package";
import { generateArguments } from "./utils";

/**
 * Delete a package
 * @param {String} namespace
 * @param {String} name
 * @param {String} cluster
 */
export async function uninstall(namespace: string, name: string, cluster: string) {
    const argoPackage = await Package.info(namespace, name, cluster);
    return argoPackage.delete(cluster, namespace);
}

/**
 * Run a package or package template
 * @param {string} namespace
 * @param {string} name
 * @param {string} templateName
 * @param {string} serviceAccountName
 * @param {string} imagePullSecrets
 * @param {Boolean} cluster
 */
export async function run(
    namespace: string,
    name: string,
    templateName: string,
    serviceAccountName: string,
    imagePullSecrets: string,
    cluster: boolean
) {
    const runArguments = generateArguments(process.argv);
    const argoPackage = await Package.info(namespace, name, cluster);
    if (templateName)
        return argoPackage.runTemplate(
            templateName,
            runArguments,
            serviceAccountName,
            imagePullSecrets,
            cluster,
            namespace
        );
    return argoPackage.run(runArguments, serviceAccountName, imagePullSecrets, cluster, namespace);
}