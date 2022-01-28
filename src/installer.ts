import * as fs from 'fs';
import mkdirp = require('mkdirp');
import * as path from 'path';
import * as stream from 'stream';
import { Errorable, err, ok, isErr } from "./errorable";

const BINDLE_DONWLOAD_URL_TEMPLATE = "https://bindle.blob.core.windows.net/releases/bindle-v0.7.1-{{subst:os}}-{{subst:arch}}.tar.gz";
const BINDLE_TOOL_NAME = "bindle";
const BINDLE_BIN_NAME = "bindle";

export async function ensureBindleInstalled(): Promise<Errorable<string>> {
    const toolFile = installLocation(BINDLE_TOOL_NAME, BINDLE_BIN_NAME);
    const status = fs.statSync(toolFile);
    if (!status.isFile()) {
        const downloadResult = await downloadBindleTo(toolFile);
        if (isErr(downloadResult)) {
            return downloadResult;
        }
    }
    return ok(toolFile);
}

async function downloadBindleTo(toolFile: string): Promise<Errorable<null>> {
    const sourceUrl = downloadSource();
    if (isErr(sourceUrl)) {
        return sourceUrl;
    }

    mkdirp.sync(path.dirname(toolFile));

    const downloadResult = await downloadTo(sourceUrl.value, toolFile);
    if (isErr(downloadResult)) {
        return downloadResult;
    }

    makeExecutable(toolFile);

    return ok(null);
}

function downloadSource(): Errorable<string> {
    const osId = os();
    const archId = arch();

    if (osId === null || archId === null) {
        return err("Unsupported operating system or processor architecture");
    }

    const url = BINDLE_DONWLOAD_URL_TEMPLATE.replace("{{subst:os}}", osId).replace("{{subst:arch}}", archId);
    return ok(url);
}

export function installLocation(tool: string, bin: string): string {
    // The ideal is to cache in extension storage (ExtensionContext::globalStorage)
    // but shelljs can only run from a plain ol' file path, so file path it is.
    const basePath = path.join(home(), `.fermyon/autobindle/tools`);
    const toolPath = path.join(basePath, tool);
    const binSuffix = process.platform === 'win32' ? '.exe' : '';
    const toolFile = path.join(toolPath, bin + binSuffix);
    return toolFile;
}

function makeExecutable(file: string): void {
    if (process.platform === 'win32') {
        // do nothing
    } else {
        fs.chmodSync(file, '0755');
    }
}

function os(): string | null {
    switch (process.platform) {
        case 'win32': return 'windows';
        case 'darwin': return 'darwin';
        case 'linux': return 'linux';
        default: return null;
    }
}

function arch(): string | null {
    return "amd64";
}

type DownloadFunc =
    (url: string, destination?: string, options?: unknown)
         => Promise<Buffer> & stream.Duplex; // Stream has additional events - see https://www.npmjs.com/package/download

let downloadImpl: DownloadFunc | undefined;

function ensureDownloadFunc() {
    if (!downloadImpl) {
        // Fix download module corrupting HOME environment variable on Windows
        // See https://github.com/Azure/vscode-kubernetes-tools/pull/302#issuecomment-404678781
        // and https://github.com/kevva/npm-conf/issues/13
        const home = process.env['HOME'];
        downloadImpl = require('download');
        if (home) {
            process.env['HOME'] = home;
        }
    }
}

function download(url: string, destinationFile: string): Promise<Buffer> & stream.Duplex {
    ensureDownloadFunc();
    if (downloadImpl) {
        return downloadImpl(url, path.dirname(destinationFile), { filename: path.basename(destinationFile) });
    } else {
        throw new Error("Failed to initialise downloader");
    }
}

export async function downloadTo(sourceUrl: string, destinationFile: string): Promise<Errorable<null>> {
    ensureDownloadFunc();
    try {
        await download(sourceUrl, destinationFile);
        return ok(null);
    } catch (e) {
        return err((e as Error).message);
    }
}

function home(): string {
    return process.env['HOME'] ||
        concatIfSafe(process.env['HOMEDRIVE'], process.env['HOMEPATH']) ||
        process.env['USERPROFILE'] ||
        '';
}

function concatIfSafe(homeDrive: string | undefined, homePath: string | undefined): string | undefined {
    if (homeDrive && homePath) {
        const safe = !homePath.toLowerCase().startsWith('\\windows\\system32');
        if (safe) {
            return homeDrive.concat(homePath);
        }
    }

    return undefined;
}
