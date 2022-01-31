# autobindle

A VS Code extension that makes your life easier if you've got a Bindle server in your dev workflow.

## Usage

Some development workflows, such as when using Wasm components or building Hippo applications,
use a Bindle server as their registry of application binaries and assets. This extension
simplifies the process of standing up a local development Bindle server. It automatically
downloads the Bindle server binary if requires, runs it on a port of your choice, and
stops it when you close your workspace.

## Basic Commands

* `Bindle: Start` starts the Bindle server.  If it's the first time you've run this command, it
  first downloads the Bindle server binary, which can take a little while.  After that it uses
  the cached binary so is much faster to start up!
* `Bindle: Stop` stops the currently running Bindle server.

The Bindle server uses a file system based back end, with storage under your home directory.
Access is unauthenticated so be sure that the Bindle port is not exposed to other machines!

While Bindle is running, the word `Bindle` is displayed in the status bar. You can hover over
this to see the Bindle port.

## Environments

The environments feature allows you to have multiple server configurations with different
backing directories. This allows you to keep projects separate, or to maintain a stable
integration testing environment while also having a scratch area for messing around.

Each environment is backed by its own data directory. You can only have one environment active
at a time. You don't need to set up environments unless you want to (the extension creates
and uses a default one automatically).

* `Bindle: Switch Environment` updates your configuration to point to a new data directory.
  If Bindle is running, it is restarted with the newly chosen directory.
* `Bindle: New Environment` creates a new environment backed by a directory under your
  home directory. It automatically switches to the new environment, so this restarts
  Bindle if it's running.
* `Bindle: New Environment in Chosen Folder` creates a new environment but allows you to
  choose the backing directory. This can be useful if, for example, your project contains
  its own set of test bindles.

You can hover over the `Bindle` status bar item to see which environment you're currently in.

## Configuration

The extension defines the following configuration entries:

* `autobindle.port`: The port on which to serve. If not specified this defaults to 8080.
* `autobindle.activeEnvironment`: The name of the currently selected environment. You won't
  normally need to edit this manually - use the Switch Environemnt command instead.
* `autobindle.environments`: The list of environments (names and backing directories).
  You won't normally need to edit this manually - use the New Environment commands instead.

The `environments` setting can be set at a machine level only - this prevents a workspace
overriding the setting.  The `activeEnvironment` setting can be set at any level, so you can
associate a project to its own Bindle environment. This is applied only in trusted workspaces.
