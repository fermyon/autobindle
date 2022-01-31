import * as vscode from 'vscode';
import { ChildProcess, ExecException, execFile } from 'child_process';
import { isErr } from './errorable';

import * as installer from './installer';
import { BindleStatusBarItem, newStatusBarItem } from './statusbar';
import { environmentForStart } from './environment';
import { isCancelled } from './cancellable';

let BINDLE_RUNNING_INSTANCE: ChildProcess | null = null;
let BINDLE_EXPECT_EXIT = false;
const BINDLE_STATUS_BAR_ITEM: BindleStatusBarItem = newStatusBarItem();

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
    tryStopRunningInstance();
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

    const environment_ = await environmentForStart();
    if (isCancelled(environment_)) {
        return;
    }
    const environment = environment_.value;
    const storeDirectory = environment.storagePath;
    // Is there a current environment?  If not:
    //    * Are there existing environments in the config?  If so, prompt.
    //    * Otherwise, create a default environment.
    
    // Start Bindle with appropriate options.
    const port = vscode.workspace.getConfiguration().get<number>("autobindle.port");
    const address = `127.0.0.1:${port}`;
    try {
        BINDLE_EXPECT_EXIT = false;
        const args = [
            "--unauthenticated",
            "-i", address,
            "-d", storeDirectory
        ];
        const childProcess = execFile(programFile, args, { }, onBindleExit);
        BINDLE_RUNNING_INSTANCE = childProcess;
    } catch (e) {
        await vscode.window.showErrorMessage(`Error launching Bindle server: ${e}`);
        return;
    }

    BINDLE_STATUS_BAR_ITEM.show(environment.name, address);
}

async function stop() {
    const stopResult = tryStopRunningInstance();

    if (stopResult === StopResult.NoInstanceRunning) {
        await vscode.window.showInformationMessage("Bindle is not running");
    } else if (stopResult === StopResult.StopFailed) {
        await vscode.window.showErrorMessage("Bindle did not respond to stop request");
    }
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

function markNotRunning() {
    BINDLE_RUNNING_INSTANCE = null;
    BINDLE_STATUS_BAR_ITEM.hide();
}

function onBindleExit(e: ExecException | null, _stdout: string, stderr: string) {
    if (BINDLE_EXPECT_EXIT) {
        return;  // The thing causing the exit should clear the global
    }

    markNotRunning();

    if (e && e.code === 0) {
        return;
    }
    const code = (e && e.code) ? e.code.toString() : "no code";

    // This is mainly but not entirely to handle the case of failure on startup,
    // so the phrasing needs to be a bit generic.
    vscode.window.showErrorMessage(`Bindle server error (${code}): ${stderr}`);
}

enum StopResult {
    NoInstanceRunning,
    Stopped,
    StopFailed,
}

function tryStopRunningInstance(): StopResult {
    BINDLE_EXPECT_EXIT = true;
    if (BINDLE_RUNNING_INSTANCE === null || BINDLE_RUNNING_INSTANCE.killed) {
        return StopResult.NoInstanceRunning;
    } else {
        const killed = BINDLE_RUNNING_INSTANCE.kill("SIGTERM")
            || BINDLE_RUNNING_INSTANCE.kill("SIGQUIT")
            || BINDLE_RUNNING_INSTANCE.kill("SIGKILL");
        if (killed) {
            markNotRunning();
            return StopResult.Stopped;
        } else {
            return StopResult.StopFailed;
        }
    }
}
