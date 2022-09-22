import {Argv} from "yargs";


console.info(`CLI starter.`);

function serve(port: string) {
    console.info(`Serve on port ${port}.`);
}

require('yargs')
    .command('serve', "Start the server.", (yargs: Argv) => {
        yargs.option('port', {
            describe: "Port to bind on",
            default: "5000",
        }).option('verbose', {
            alias: 'v',
            default: false,
        })
    }, (args: any) => {
        if (args.verbose) {
            console.info("Starting the server...");
        }
        serve(args.port);
    }).argv;