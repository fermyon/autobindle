import * as vscode from 'vscode';
import { ChildProcess, ExecException, execFile } from 'child_process';
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

    // Is there a current environment?  If not:
    //    * Are there existing environments in the config?  If so, prompt.
    //    * Otherwise, create a default environment.
    const storeDirectory = `~/.fermyon/autobindle/data/default`;
    
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

    // TODO: consider a status bar item that shows when Bindle is running and can be hovered/clicked for info/commands
    // This would be less intrusive than a notification on successful launch though maybe less obvious
}

async function stop() {
    const stopResult = tryStopRunningInstance();

    if (stopResult === StopResult.NoInstanceRunning) {
        await vscode.window.showInformationMessage("Bindle is not running");
    } else if (stopResult === StopResult.StopFailed) {
        await vscode.window.showErrorMessage("Bindle did not respond to stop request");
    }
    // TODO: should we show a message if succeeded?
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

function onBindleExit(e: ExecException | null, _stdout: string, stderr: string) {
    if (BINDLE_EXPECT_EXIT) {
        return;  // The thing causing the exit should clear the global
    }
    BINDLE_RUNNING_INSTANCE = null;

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
            BINDLE_RUNNING_INSTANCE = null;
            return StopResult.Stopped;
        } else {
            return StopResult.StopFailed;
        }
    }
}
