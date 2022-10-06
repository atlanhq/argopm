import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import shell from "shelljs";
import yarg from "../bin/install.mjs";
import { initHelp } from "../lib/help.mjs";

const TMP_DIR = "/tmp/test-init-package";

describe("argopm init", () => {
    beforeEach(() => {
        jest.resetModules();
        shell.rm("-Rf", TMP_DIR);
        shell.mkdir(TMP_DIR);
        // jest.spyOn(console, 'log')
        // jest.spyOn(console, 'error')
        // jest.spyOn(process, 'exit').mockImplementation((code: number) => jest.fn() as never);
    });

    afterEach(() => {
        jest.resetAllMocks();
        shell.rm("-Rf", TMP_DIR);
        shell.cd("-");
    });

    it("should run init successfully", async () => {
        const consoleSpy = jest.spyOn(console, "log");
        const currentDir = shell.pwd();
        shell.cd(TMP_DIR);

        await yarg.parse("init .");
        expect(shell.test("-e", "package.json")).toBe(true);

        const outputDirLs = shell.ls(`${TMP_DIR}/`);
        const inputDirLs = shell.ls(`${currentDir.stdout}/lib/static/package/`);
        const packageNameSplit = TMP_DIR.split("/");
        const packageName = packageNameSplit[packageNameSplit.length - 1];
        expect(consoleSpy).toBeCalledWith(
            `Installing from the current directory (/private${TMP_DIR}) with the package name "${packageName}"...`
        );
        expect(consoleSpy).toBeCalledWith(initHelp.replace(/NAME/g, packageName));
        expect(outputDirLs).toEqual(expect.arrayContaining(inputDirLs));
        consoleSpy.mockRestore();
    });

    // it("should run init with different registry successfully", async () => {
    //     const consoleSpy = jest.spyOn(console, "log");
    //     const currentDir = shell.pwd();
    //     shell.cd(TMP_DIR);

    //     await yarg.parse("init .");

    //     const outputDirLs = shell.ls(`${TMP_DIR}/`);
    //     const inputDirLs = shell.ls(`${currentDir.stdout}/lib/static/package/`);
    //     expect(consoleSpy).toBeCalledWith("Installing from the current directory (/private/tmp/sample1) with the package name \"sample1\"...")
    //     expect(consoleSpy).toBeCalledWith(initHelp.replace(/NAME/g, "sample1"));
    //     expect(outputDirLs).toEqual(expect.arrayContaining(inputDirLs));
    //     consoleSpy.mockRestore();
    // });

    // it("should not run init successfully when with --force and package.json already exists", async () => {
    //     shell.cd(TMP_DIR);

    //     await yarg.parse("init .");
    //     expect(shell.test("-e", "package.json")).toBe(true);

    //     const consoleErrorSpy = jest.spyOn(console, "error");
    //     const exitSpy = jest.spyOn(process, 'exit');
    //     // expect.assertions(1);
    //     await expect(() => yarg.parse("init .")).rejects.toThrowError();
    //     // await yarg.parse("init .");
    //     // expect(shell.test("-e", "package.json")).toBe(true);
    //     // try {
    //     //     await expect(async () => await yarg.parse("init .")).rejects.toBeInstanceOf(Error);
    //     // } catch (err) {
    //     //     // expect(err).toBe(Error)
    //     // }
    //     // // expect(exitSpy).toHaveBeenCalledWith(1);
    //     expect(consoleErrorSpy).toBeCalledWith(`Files already present in the /private/tmp/test-init-package. Run this command again with --force to ignore`)
    //     expect(consoleErrorSpy).toBeCalledTimes(1);
    //     exitSpy.mockRestore();
    //     consoleErrorSpy.mockRestore();
    // });
});
