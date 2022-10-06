import yarg from "./install.mjs";
import shelljs from "shelljs";
import nock from "nock";
import { jest } from '@jest/globals'
import { initHelp } from "../lib/help.mjs";
import * as querystring from 'querystring';
import { Cluster, KubeConfig, KubernetesObjectApi } from "@kubernetes/client-node";
import { anything, anyFunction, instance, mock, verify, when } from 'ts-mockito';
import { WebSocketHandler, WebSocketInterface } from "@kubernetes/client-node/dist/web-socket-handler.js";
import { S3 } from "../lib/s3.mjs";

const kubeconfigConfig = {
    clusters: [{ name: 'dc', server: 'https://d.i.y', skipTLSVerify: true }],
    users: [{ name: 'ian', password: 'mackaye' }],
    contexts: [{ name: 'dischord', cluster: 'dc', user: 'ian' }],
    currentContext: 'dischord',
};

KubeConfig.prototype.loadFromDefault = jest.fn(() => KubeConfig.prototype.loadFromOptions(kubeconfigConfig));
KubeConfig.prototype.getCurrentCluster = jest.fn(() => kubeconfigConfig.clusters[0]);

const defaultConfigmap = {
    "apiVersion": "v1",
    "data": {
        "bucket": "atlan-vcluster-aldwyn-argopm-revamp-7a2eo77n7k3e",
        "domain": "aldwyn-argopm-revamp.atlan.dev",
        "instance": "aldwyn-argopm-revamp",
        "region": "ap-south-1",
        "segment_write_key": "UltvqYHxLXFjbkhyIM7gLwabTnyk6PJh"
    },
    "kind": "ConfigMap",
    "metadata": {
        "annotations": {
            "kubectl.kubernetes.io/last-applied-configuration": "{\"apiVersion\":\"v1\",\"data\":{\"bucket\":\"atlan-vcluster-aldwyn-argopm-revamp-7a2eo77n7k3e\",\"domain\":\"aldwyn-argopm-revamp.atlan.dev\",\"instance\":\"aldwyn-argopm-revamp\",\"region\":\"ap-south-1\",\"segment_write_key\":\"UltvqYHxLXFjbkhyIM7gLwabTnyk6PJh\"},\"kind\":\"ConfigMap\",\"metadata\":{\"annotations\":{},\"labels\":{\"argocd.argoproj.io/instance\":\"aldwyn-argopm-revamp\",\"workflows.argoproj.io/configmap-type\":\"Parameter\"},\"name\":\"atlan-defaults\",\"namespace\":\"default\"}}\n"
        },
        "creationTimestamp": "2022-09-30T05:19:29Z",
        "labels": {
            "argocd.argoproj.io/instance": "aldwyn-argopm-revamp",
            "workflows.argoproj.io/configmap-type": "Parameter"
        },
        "name": "atlan-defaults",
        "namespace": "default",
        "resourceVersion": "709",
        "uid": "a438752f-c9d0-4337-ad3b-02c938ec3aec"
    }
};

// const mockK8sApiClient = () => {
//     const kc = new KubeConfig();
//     const fakeWebSocket: WebSocketInterface = mock(WebSocketHandler);
//     const exec = new Exec(kc, instance(fakeWebSocket));
//     const cp = new Cp(kc, exec);

//     const namespace = 'somenamespace';
//     const pod = 'somepod';
//     const container = 'container';
//     const srcPath = '/';
//     const tgtPath = '/';
//     const cmdArray = ['tar', 'zcf', '-', srcPath];
//     const path = `/api/v1/namespaces/${namespace}/pods/${pod}/exec`;

//     const query = {
//         stdout: true,
//         stderr: true,
//         stdin: false,
//         tty: false,
//         command: cmdArray,
//         container,
//     };
//     const queryStr = querystring.stringify(query);
// }



describe("argopm init", () => {
    const tmpDir = "/tmp/sample1";

    beforeEach(() => {
        jest.resetModules();
        shelljs.rm("-Rf", tmpDir);
        shelljs.mkdir(tmpDir);
    });

    afterEach(() => {
        jest.resetAllMocks();
        shelljs.rm("-Rf", tmpDir);
        shelljs.cd("-");
    });

    it("should run init successfully", async () => {
        const consoleSpy = jest.spyOn(console, "log");
        const currentDir = shelljs.pwd();
        shelljs.cd(tmpDir);

        await yarg.parse("init .");

        const outputDirLs = shelljs.ls(`${tmpDir}/`);
        const inputDirLs = shelljs.ls(`${currentDir.stdout}/lib/static/package/`);
        expect(consoleSpy).toBeCalledWith("Installing from the current directory (/private/tmp/sample1) with the package name \"sample1\"...")
        expect(consoleSpy).toBeCalledWith(initHelp.replace(/NAME/g, "sample1"));
        expect(outputDirLs).toEqual(expect.arrayContaining(inputDirLs));
        consoleSpy.mockRestore();
    });

    it("should not run init successfully when with --force and package.json already exists", async () => {
        const exitSpy = jest.spyOn(process, 'exit');
        shelljs.cd(tmpDir);

        await yarg.parse("init .");
        await yarg.parse("init . -f");

        expect(async () => await yarg.parse("init ."))
            .toThrow(`Files already present in the /private/tmp/sample1. Run this command again with --force to ignore`);
        expect(exitSpy).toHaveBeenCalledWith(-1);
        exitSpy.mockRestore();
    });
});


// describe("argopm install", () => {
//     const tmpDir = "/tmp/sample1";

//     beforeEach(() => {
//         jest.resetModules();
//         shelljs.mkdir(tmpDir);
//     });

//     afterEach(() => {
//         jest.resetAllMocks();
//         shelljs.cd("-");
//         shelljs.rm("-Rf", tmpDir);
//     });

//     it("should run install the local package, without dependencies, successfully", async () => {
//         const consoleSpy = jest.spyOn(console, "log");
//         const namespace = "default";
//         const atlanDefaultsConfigmap = "atlan-defaults";
//         const currentDir = shelljs.pwd();
//         shelljs.cp("-R", `${currentDir.stdout}/tests/fixtures/mock-package/*`, `${tmpDir}/`);
//         shelljs.cd(tmpDir);

//         const scope = nock('https://d.i.y')
//             .persist()
//             .get(`/api/v1/namespaces/${namespace}/configmaps/${atlanDefaultsConfigmap}`)
//             .reply(200, defaultConfigmap);

//         await yarg.parse("install . -x");

//         scope.done();
//         expect(true).toEqual(true);
//     });
// });


// describe("argopm uninstall", () => {
//     const tmpDir = "/tmp/sample1";

//     beforeEach(() => {
//         jest.resetModules();
//         shelljs.mkdir(tmpDir);
//     });

//     afterEach(() => {
//         jest.resetAllMocks();
//         shelljs.cd("-");
//         shelljs.rm("-Rf", tmpDir);
//     });

//     it("should run uninstall successfully", async () => {
//         const namespace = "default";
//         const atlanDefaultsConfigmap = "atlan-defaults";
//         const currentDir = shelljs.pwd();
//         shelljs.cp("-R", `${currentDir.stdout}/tests/fixtures/mock-package/*`, `${tmpDir}/`);
//         shelljs.cd(tmpDir);

//         const scope = nock('https://d.i.y')
//             .persist()
//             .get(`/api/v1/namespaces/${namespace}/configmaps/${atlanDefaultsConfigmap}`)
//             .reply(200, defaultConfigmap);

//         await yarg.parse("install . -x");

//         scope.done();

//         await yarg.parse("uninstall . -x");
//     });
// });
