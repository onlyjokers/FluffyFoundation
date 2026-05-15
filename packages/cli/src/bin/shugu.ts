#!/usr/bin/env node
/**
 * Purpose: Executable entrypoint for the shugu CLI.
 */

import { runCli } from '../cli.js';

const exitCode = await runCli();
process.exitCode = exitCode;
