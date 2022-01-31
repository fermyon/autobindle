import * as path from 'path';
import * as vscode from 'vscode';
import { accepted, Cancellable, cancelled } from './cancellable';
import * as layout from './layout';

export interface BindleEnvironment {
    readonly name: string;
    readonly storagePath: string;
}

export async function environmentForStart(): Promise<Cancellable<BindleEnvironment>> {
    const activeEnvironmentName = vscode.workspace.getConfiguration().get<string>("autobindle.activeEnvironment");
    const allEnvironments = vscode.workspace.getConfiguration().get<BindleEnvironment[]>("autobindle.environments") || [];
    const activeEnvironment = allEnvironments.find(e => e.name === activeEnvironmentName);
    if (activeEnvironment) {
        return accepted(activeEnvironment);
    }

    // No active environment: prompt if multiple, else use sole or create default
    if (allEnvironments.length === 0) {
        const defaultEnvironment = await createDefaultEnvironment();
        return accepted(defaultEnvironment);
    } else if (allEnvironments.length === 1) {
        const theEnvironment = allEnvironments[0];
        await setActive(theEnvironment.name);
        return accepted(theEnvironment);
    } else {
        const selected = await vscode.window.showQuickPick(
            allEnvironments.map(asQuickPick),
            { placeHolder: 'Environment to start Bindle in' }
        );
        if (!selected) {
            return cancelled();
        }
        const selectedEnvironment = selected.environment;
        await setActive(selectedEnvironment.name);
        return accepted(selectedEnvironment);
    }
}

export async function promptSwitch(): Promise<Cancellable<BindleEnvironment>> {
    const activeEnvironmentName = vscode.workspace.getConfiguration().get<string>("autobindle.activeEnvironment");
    const allEnvironments = vscode.workspace.getConfiguration().get<BindleEnvironment[]>("autobindle.environments") || [];

    if (allEnvironments.length < 2) {
        await vscode.window.showInformationMessage("There are no other Bindle environments to switch to.");
        return cancelled();
    }

    const otherEnvironments = allEnvironments.filter(e => e.name !== activeEnvironmentName);

    const selected = await vscode.window.showQuickPick(
        otherEnvironments.map(asQuickPick),
        { placeHolder: 'Environment to switch to' }
    );
    if (!selected) {
        return cancelled();
    }

    const selectedEnvironment = selected.environment;
    await setActive(selectedEnvironment.name);
    return accepted(selectedEnvironment);
}

async function setActive(environmentName: string) {
    await vscode.workspace.getConfiguration().update("autobindle.activeEnvironment", environmentName, vscode.ConfigurationTarget.Global);
}

export function environmentExists(environmentName: string): boolean {
    const allEnvironments = vscode.workspace.getConfiguration().get<BindleEnvironment[]>("autobindle.environments") || [];
    return allEnvironments.some(e => e.name === environmentName);
}

export async function setEnvironment(environmentName: string, storagePath: string): Promise<BindleEnvironment> {
    const allEnvironments = vscode.workspace.getConfiguration().get<BindleEnvironment[]>("autobindle.environments") || [];
    const newEnvironment = { name: environmentName, storagePath };
    const existingEnvironmentIndex = allEnvironments.findIndex(e => e.name === environmentName);
    if (existingEnvironmentIndex < 0) {
        allEnvironments.push(newEnvironment);
    } else {
        allEnvironments[existingEnvironmentIndex] = newEnvironment;
    }
    await vscode.workspace.getConfiguration().update("autobindle.environments", allEnvironments, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration().update("autobindle.activeEnvironment", environmentName, vscode.ConfigurationTarget.Global);
    return newEnvironment;
}

async function createDefaultEnvironment(): Promise<BindleEnvironment> {
    const name = "default";
    const storagePath = autoStoragePath(name);
    return await setEnvironment(name, storagePath);
}

export function autoStoragePath(name: string) {
    const basePath = layout.dataFolder();
    const storagePath = path.join(basePath, name);
    return storagePath;
}

function asQuickPick(environment: BindleEnvironment): vscode.QuickPickItem & { readonly environment: BindleEnvironment } {
    return {
        label: environment.name,
        description: `(data directory: ${environment.storagePath})`,
        environment,
    };
}
