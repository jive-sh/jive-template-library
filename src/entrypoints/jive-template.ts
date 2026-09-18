import { program } from "commander";
import { cicd } from "../internal/commands/cicd";
import { CLI_CMD_NAME } from "../internal/common/constants";

program.name(CLI_CMD_NAME).description("build and publish a library package from this template");
program.addCommand(cicd);
program.parse();

if (process.argv.length <= 2) program.help();
