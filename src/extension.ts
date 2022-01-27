import * as vscode from 'vscode';

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
    // If there is a running instance, stop it
}

async function start() {
    // Is Bindle already running?  If so, display current environment and return.
    // Is Bindle binary downloaded?  If not, download it.
    // Is there a current environment?  If not:
    //    * Are there existing environments in the config?  If so, prompt.
    //    * Otherwise, create a default environment.
    // Start Bindle with appropriate options.
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
