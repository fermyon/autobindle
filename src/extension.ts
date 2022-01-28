import { ChildProcess } from 'child_process';
import * as shelljs from 'shelljs';
import * as vscode from 'vscode';
import { isErr } from './errorable';

import * as installer from './installer';

let BINDLE_RUNNING_INSTANCE: ChildProcess | null = null;
let BINDLE_EXPECT_EXIT = false;

export function activate(context: vscode.ExtensionContext) {
    
    const disposables = [
        vscode.commands.registerCommand('autobindle.start', start),
        vscode.commands.registerCommand('autobindle.stop', stop),
        vscode.commands.registerCommand('autobindle.switch', switchEnvironment),
        vscode.commands.registerCommand('autobindle.new', newEnvironment),
    ];

    context.subscriptions.push(...disposables);
}

export function deactivate() {
    BINDLE_EXPECT_EXIT = true;
    if (BINDLE_RUNNING_INSTANCE !== null && !BINDLE_RUNNING_INSTANCE.killed) {
        BINDLE_RUNNING_INSTANCE.kill("SIGTERM")
        || BINDLE_RUNNING_INSTANCE.kill("SIGQUIT")
        || BINDLE_RUNNING_INSTANCE.kill("SIGKILL");
    }
}

async function start() {
    // Is Bindle already running?  If so, display current environment and return.
    if (BINDLE_RUNNING_INSTANCE !== null && !BINDLE_RUNNING_INSTANCE.killed) {
        // TODO: show port and environment
        await vscode.window.showInformationMessage(`Bindle is already running`);
        return;
    }

    // Is Bindle binary downloaded?  If not, download it.
    const programFile_ = await installer.ensureBindleInstalled();
    if (isErr(programFile_)) {
        await vscode.window.showErrorMessage(`Can't find or download Bindle: ${programFile_.message}`);
        return;
    }
    const programFile = programFile_.value;

    // Is there a current environment?  If not:
    //    * Are there existing environments in the config?  If so, prompt.
    //    * Otherwise, create a default environment.
    // Start Bindle with appropriate options.
    try {
        BINDLE_EXPECT_EXIT = false;
        const childProcess = shelljs.exec(programFile, { async: true }, onBindleExit);
        BINDLE_RUNNING_INSTANCE = childProcess;
    } catch (e) {
        await vscode.window.showErrorMessage(`Error launching Bindle server: ${e}`);
        return;
    }

    // Record identification for the running instance.
    // TODO: consider a status bar item that shows when Bindle is running and can be hovered/clicked for info/commands
    const port = vscode.workspace.getConfiguration().get<number>("autobindle.port");
    await vscode.window.showInformationMessage(`Starting Bindle on port ${port}...`);
}

function stop() {
    // Is Bindle already running?  If so, stop it.
    // Otherwise, display a message.
}

function switchEnvironment() {
    // If there are no environments, or only one environment, display info
    //    that there are no other environments to switch to, and return
    // Show list of environments from config (with decorator for current)
    // If user:
    //   * cancels, do nothing
    //   * selects active, show message that they are already on that
    //   * selects other:
    //     * if Bindle is running, record that and stop it
    //     * change the `activeEnvironment` config
    //     * if Bindle was running, restart it with the new environment
}

function newEnvironment() {
    // Prompt for name and path
    // Add to config
}

function onBindleExit(code: number, _stdout: string, stderr: string) {
    if (BINDLE_EXPECT_EXIT || code === 0) {
        return;
    }
    BINDLE_RUNNING_INSTANCE = null;
    vscode.window.showErrorMessage(`Bindle server error (${code}): ${stderr}`);
}
