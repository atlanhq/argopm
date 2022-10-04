import yarg from "./install.mjs";

describe("cli", () => {
    let originalArgv;

    beforeEach(() => {
        // Remove all cached modules. The cache needs to be cleared before running
        // each command, otherwise you will see the same results from the command
        // run in your first test in subsequent tests.
        jest.resetModules();

        // Each test overwrites process arguments so store the original arguments
        originalArgv = process.argv;
    });

    afterEach(() => {
        jest.resetAllMocks();

        // Set process arguments back to the original value
        process.argv = originalArgv;
    });

    it("should run install command", async () => {
        const consoleSpy = jest.spyOn(console, "log");

        await runCommand("install", "some-package", "--save");

        expect(consoleSpy).toHaveBeenCalledWith("Installing");
    });

    it("should run uninstall command", async () => {
        const consoleSpy = jest.spyOn(console, "log");

        await runCommand("uninstall", "some-package");

        expect(consoleSpy).toHaveBeenCalledWith("Uninstalling");
    });
});

/**
 * Programmatically set arguments and execute the CLI script
 *
 * @param {...string} args - positional and option arguments for the command to run
 */
async function runCommand(...args) {
    process.argv = [
        "node", // Not used but a value is required at this index in the array
        "cli.js", // Not used but a value is required at this index in the array
        ...args,
    ];

    // Require the yargs CLI script
    return yarg;
}
