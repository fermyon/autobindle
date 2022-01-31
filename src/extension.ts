import * as vscode from 'vscode';
import { ChildProcess, execFile } from 'child_process';
import { isErr } from './errorable';

import * as installer from './installer';
import { BindleStatusBarItem, newStatusBarItem } from './statusbar';
import { autoStoragePath, environmentExists, environmentForStart, promptSwitch, setEnvironment } from './environment';
import { isCancelled } from './cancellable';
import { longRunning } from './longrunning';
import { sleep } from './sleep';

let ACTIVE_INSTANCE: ChildProcess | null = null;
const STOPPING_INSTANCES: ChildProcess[] = [];
const BINDLE_STATUS_BAR_ITEM: BindleStatusBarItem = newStatusBarItem();

export function activate(context: vscode.ExtensionContext) {
    
    const disposables = [
        vscode.commands.registerCommand('autobindle.start', start),
        vscode.commands.registerCommand('autobindle.stop', stop),
        vscode.commands.registerCommand('autobindle.switch', switchEnvironment),
        vscode.commands.registerCommand('autobindle.new', newEnvironment),
        vscode.commands.registerCommand('autobindle.newInFolder', newEnvironmentInFolder),
    ];

    context.subscriptions.push(...disposables);
}

export function deactivate() {
    tryStopRunningInstance();
}

async function start() {
    // Is Bindle already running?  If so, display current environment and return.
    if (ACTIVE_INSTANCE !== null && !ACTIVE_INSTANCE.killed) {
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
    const environment_ = await environmentForStart();
    if (isCancelled(environment_)) {
        return;
    }
    const environment = environment_.value;
    const storeDirectory = environment.storagePath;
    
    // Start Bindle with appropriate options.
    const port = vscode.workspace.getConfiguration().get<number>("autobindle.port");
    const address = `127.0.0.1:${port}`;
    try {
        const args = [
            "--unauthenticated",
            "-i", address,
            "-d", storeDirectory
        ];
        const childProcess = execFile(programFile, args, { });
        ACTIVE_INSTANCE = childProcess;
        childProcess.on("exit",
            (code, signal) => onBindleProcessExit(childProcess, code, signal)
        );
    } catch (e) {
        await vscode.window.showErrorMessage(`Error launching Bindle server: ${e}`);
        return;
    }

    BINDLE_STATUS_BAR_ITEM.show(environment.name, address);
}

async function stop() {
    const stopResult = await tryStopRunningInstance();

    if (stopResult === StopResult.NoInstanceRunning) {
        await vscode.window.showInformationMessage("Bindle is not running");
    } else if (stopResult === StopResult.StopFailed) {
        await vscode.window.showErrorMessage("Bindle did not respond to stop request");
    }
}

async function restartIfRunning(environmentName: string) {
    if (isRunning(ACTIVE_INSTANCE)) {
        await longRunning(`Restarting Bindle in '${environmentName}' data environment...`, () =>
            restart()
        );
    }
}

async function restart() {
    const stopResult = await tryStopRunningInstance();
    if (stopResult === StopResult.StopFailed) {
        await vscode.window.showErrorMessage("Unable to restart Bindle. Existing instance refused to terminate");
    } else {
        await start();
    }
}

async function switchEnvironment() {
    const environment_ = await promptSwitch();
    if (isCancelled(environment_)) {
        return;
    }
    const environment = environment_.value;

    await restartIfRunning(environment.name);
}

async function newEnvironment() {
    const name = await vscode.window.showInputBox({ prompt: "A name for the new Bindle data environment" });
    if (!name) {
        return;
    }
    if (environmentExists(name)) {
        await vscode.window.showErrorMessage("That environment already exists");
        return;
    }
    if (!isDirectorySafe(name)) {
        await vscode.window.showErrorMessage("The environment name is used as a directory name. Please choose one with alphanumeric and dash/underscore characters only.");
        return;
    }

    const storagePath = autoStoragePath(name);

    await setEnvironment(name, storagePath);
    await restartIfRunning(name);
}

async function newEnvironmentInFolder() {
    const name = await vscode.window.showInputBox({ prompt: "A name for the new Bindle data environment" });
    if (!name) {
        return;
    }
    if (environmentExists(name)) {
        const overwrite = 'Update existing environment';
        const response = await vscode.window.showErrorMessage(`An environment with the name '${name}' already exists.`, overwrite, 'Cancel');
        if (response !== overwrite) {
            return;
        }
    }

    const storagePath = await vscode.window.showOpenDialog({
        title: "Bindle storage path for the new environment",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Create Environment"
    });
    if (!storagePath || storagePath.length !== 1) {
        return;
    }
    if (storagePath[0].scheme !== 'file') {
        await vscode.window.showErrorMessage("The Bindle dev server only works with filesystem locations");
        return;
    }

    await setEnvironment(name, storagePath[0].fsPath);
    await restartIfRunning(name);
}

async function awaitNotRunning(instance: ChildProcess) {
    if (isRunning(instance)) {
        for (let i = 0; i < 20; ++i) {
            if (isRunning(instance)) {
                break;
            }
            sleep(50);
        }
    }
}

async function onBindleProcessExit(process: ChildProcess, code: number | null, _signal: string | null) {
    // Is it the current Bindle process terminating?  During a restart it can be an old one.
    if (process !== ACTIVE_INSTANCE) {
        return;
    }
    if (STOPPING_INSTANCES.includes(process)) {
        return;
    }
    if (code === 0) {
        return;
    }

    // It is the active instance, we aren't stopping it, and it did not exit successfully
    // This can be either:
    // * It failed on startup
    // * A user killed it from the CLI
    // * It suffered some fatal internal error
    // TODO: extract stderr and display if suitable
    ACTIVE_INSTANCE = null;
    BINDLE_STATUS_BAR_ITEM.hide();
    const codeText = code ? code.toString() : "no code";
    vscode.window.showErrorMessage(`Bindle server error (${codeText})`);
}

enum StopResult {
    NoInstanceRunning,
    Stopped,
    StopFailed,
}

async function tryStopRunningInstance(): Promise<StopResult> {
    if (ACTIVE_INSTANCE === null || ACTIVE_INSTANCE.killed) {
        return StopResult.NoInstanceRunning;
    } else {
        const instanceToStop = ACTIVE_INSTANCE;
        STOPPING_INSTANCES.push(instanceToStop);
        const killed = instanceToStop.kill("SIGTERM")
            || instanceToStop.kill("SIGQUIT")
            || instanceToStop.kill("SIGKILL");
        if (killed) {
            await awaitNotRunning(instanceToStop);
            if (isRunning(instanceToStop)) {
                return StopResult.StopFailed;
            } else {
                removeItem(STOPPING_INSTANCES, instanceToStop);
                ACTIVE_INSTANCE = null;
                BINDLE_STATUS_BAR_ITEM.hide();
                return StopResult.Stopped;
            }
        } else {
            return StopResult.StopFailed;
        }
    }
}

function isRunning(instance: ChildProcess | null): boolean {
    return instance !== null &&
        instance.exitCode === null &&
        !instance.killed;
}

function removeItem<T>(array: Array<T>, item: T) {
    const index = array.indexOf(item);
    if (index >= 0) {
        array.splice(index, 0);
    }
}

function isDirectorySafe(name: string): boolean {
    const superSafeRegex = /^[-_0-9A-Za-z]+$/;
    return superSafeRegex.test(name);
}
