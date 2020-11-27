
const { Clutter, GLib, Meta, St } = imports.gi;

const Main = imports.ui.main;


var WaylandShowDesktop = class {

	constructor() {
		this.toMaximize = [];
	}

	canUnshowDesktop() {
		return !Main.overview.visible && this.toMaximize.length > 0 && this.isShowingDesktop();
	}

	isShowingDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		return windows.every(x => x.minimized);
	}

	showDesktop() {
		// TODO para distintos workspaces
		this.toMaximize = [];
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		for (let i = 0; i < windows.length; i++) {
			if (!windows[i].minimized) {
				this.toMaximize.push(windows[i]);
				windows[i].minimize();
			}
		}
		return windows.length > 0 && windows.every(x => x.is_hidden())
	}

	unshowDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		for (let i = 0; i < windows.length; i++) {
			if (this.toMaximize.indexOf(windows[i]) !== -1)
				windows[i].unminimize();
		}
		this.toMaximize = [];
	}
}

var XShowDesktop = class {

	constructor() {
		if (Clutter.DeviceManager) {
			const deviceManager = Clutter.DeviceManager.get_default();
			this._virtualKeyboard = deviceManager.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
		} else {
			const seat = Clutter.get_default_backend().get_default_seat();
			this._virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
		}
	}

	canUnshowDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		return windows.length > 0 && windows.every(x => x.is_hidden())
	}

	canShowDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		return windows.length > 0 && windows.some(x => !x.is_hidden())
	}

	async showDesktop() {
		this._sendKeyEvent(Clutter.KEY_Super_L, Clutter.KEY_D);
	}

	async unshowDesktop() {
		this._sendKeyEvent(Clutter.KEY_Super_L, Clutter.KEY_D);
	}

	// https://gitlab.gnome.org/GNOME/metacity/-/blob/master/src/core/screen.c#L2297
	async _sendKeyEvent(...keys) {
		let currentTime = Clutter.get_current_event_time();
		keys.forEach(key => this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.PRESSED));
		keys.forEach(key => this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.RELEASED));
	}
}
