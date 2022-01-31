import * as vscode from 'vscode';

export interface BindleStatusBarItem {
    show(environmentName: string, address: string): void;
    hide(): void;
}

export function newStatusBarItem(): BindleStatusBarItem {
    return new BindleStatusBarItemImpl();
}

class BindleStatusBarItemImpl implements BindleStatusBarItem {
    private item: vscode.StatusBarItem | null;
    constructor() {
        this.item = null;
    }

    show(environmentName: string, address: string) {
        if (this.item === null) {
            this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
            this.item.text = "Bindle";
        }
        this.item.tooltip = `Running on ${address}\nData environment: ${environmentName}`;
        this.item.show();
    }

    hide() {
        if (this.item !== null) {
            this.item.hide();
        }
    }
}