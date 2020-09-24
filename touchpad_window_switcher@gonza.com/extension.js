'use strict';

const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const GLib = imports.gi.GLib;

const Main = imports.ui.main;
const WindowManager = imports.ui.windowManager;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const MyAltTab = Me.imports.myAltTab;
const DbusClient = Me.imports.dbusClient;

let gestureHandler = null;
let dbusClient = null;

let popup = null;

const MOTION_THRESHOLD = 200;
const FIRST_MOTION_THRESHOLD = 100;


function log(msg) {
	const debug = false;
	if (!debug)
		return;

	let TAG = '[TOUCHPAD_SWITCHER] ';
	global.log(TAG + msg);
}

const TouchpadGestureAction = class {

	constructor(actor, dbusClient) {
		if (Clutter.DeviceManager) {
			// Fallback for GNOME 3.32 and 3.34
			const deviceManager = Clutter.DeviceManager.get_default();
			this._virtualTouchpad = deviceManager.create_virtual_device(Clutter.InputDeviceType.TOUCHPAD_DEVICE);
			this._virtualKeyboard = deviceManager.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
			this._gestureCallbackID = actor.connect('captured-event', this._handleEvent.bind(this));
		} else {
			// For GNOME >= 3.36
			const seat = Clutter.get_default_backend().get_default_seat();
			this._virtualTouchpad = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
			this._virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
			this._gestureCallbackID = actor.connect('captured-event::touchpad', this._handleEvent.bind(this));
		}
		this._dx = 0;
		this._dy = 0;

		this.DIRECTION_LOOKUP = {
			0: Meta.MotionDirection.RIGHT,
			1: Meta.MotionDirection.DOWN,
			2: Meta.MotionDirection.LEFT,
			3: Meta.MotionDirection.UP
		};
		this._lastVertical = 0;
		this._motion_threshold = FIRST_MOTION_THRESHOLD;
		this._shortcutMinimized = false;
	}

	touchpadEvent(fingers, direction) {
		if (fingers === 0) {			
			this._gestureEnd();
			return
		}
		if (fingers !== 3)
			return

		let dir = this.DIRECTION_LOOKUP[direction];
		log(direction)
		this._gestureUpdate(dir)
	}

	_handleEvent(actor, event) {
		// Only look for touchpad swipes
		if (event.type() != Clutter.EventType.TOUCHPAD_SWIPE)
			return Clutter.EVENT_PROPAGATE;

		// Only look for three finger gestures
		if (event.get_touchpad_gesture_finger_count() != 3)
			return Clutter.EVENT_PROPAGATE;

		let [dx, dy] = event.get_gesture_motion_delta();

		this._dx += dx;
		this._dy += dy;

		let magnitude = Math.max(Math.abs(this._dx), Math.abs(this._dy));

		rounded_direction = 0;
		if (Math.abs(this._dx) > Math.abs(this._dy))
			rounded_direction += this._dx > 0 ? 0 : 2;
		else
			rounded_direction += this._dy > 0 ? 1 : 3;

		let dir = this.DIRECTION_LOOKUP[rounded_direction];

		switch (event.get_gesture_phase()) {
			case Clutter.TouchpadGesturePhase.BEGIN:
			case Clutter.TouchpadGesturePhase.UPDATE:
				if (magnitude < this._motion_threshold)
					return Clutter.EVENT_PROPAGATE;
				else
					return this._gestureUpdate(dir);
				break;
			default: // CANCEL or END
				return this._gestureEnd();
		}

		return Clutter.EVENT_STOP;
	}

	async _doAction(action) {
		switch (action) {
			case 'move-right':
				if (popup == null) {
					this._createSwitcher();
				} else {
					popup._select(popup._next());
				}
				break;
			case 'move-left':
				if (popup == null) {
					this._createSwitcher();
				} else {
					popup._select(popup._previous());
				}
				break;
			case 'close-switcher':
				if (popup != null) {
					popup._finish(global.display.get_current_time_roundtrip());
					popup = null;
				}
				break;
			case 'show-desktop':
				this._sendKeyEvent(Clutter.KEY_Super_L, Clutter.KEY_D);
				break;
			case 'unshow-desktop':
				this._sendKeyEvent(Clutter.KEY_Super_L, Clutter.KEY_D);
				break;
			default:
				break;
		}
	}

	_createSwitcher() {
		popup = new MyAltTab.WindowSwitcherPopup();
		if (!popup.show(false, '', 0)) {
			tabPopup.destroy();
		}
	}

	_gestureUpdate(dir) {
		let ret = Clutter.EVENT_PROPAGATE;

		if (dir == Meta.MotionDirection.RIGHT) {
			if (!Main.overview.visible) {
				this._doAction('move-right');
			} else {
				Main.overview.viewSelector._workspacesDisplay._getPrimaryView().navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.LEFT) {
			if (!Main.overview.visible) {
				this._doAction('move-left');
			} else {
				Main.overview.viewSelector._workspacesDisplay._getPrimaryView().navigate_focus(null, St.DirectionType.TAB_BACKWARD, false);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.UP) {
			if (popup == null && (getTime() - this._lastVertical) > 1000) {
				this._lastVertical = getTime();
				global.log('trying to unshow')
				if (this._canUnshowDesktop()) {
					this._doAction('unshow-desktop');
					ret = Clutter.EVENT_STOP;
				} else if (!Main.overview.visible) {
					log('Show overview');
					Main.overview.show();
					ret = Clutter.EVENT_STOP;
				}
			}
		} else if (dir == Meta.MotionDirection.DOWN) {
			if (popup == null && (getTime() - this._lastVertical) > 1000) {
				this._lastVertical = getTime();
				if (Main.overview.visible) {
					log('Hide overview');
					Main.overview.hide();
					ret = Clutter.EVENT_STOP;
				} else if (this._canShowDesktop()) {
					global.log('show-desktop')
					this._doAction('show-desktop');
					ret = Clutter.EVENT_STOP;
				}
			}
		}
		if (ret === Clutter.EVENT_STOP) {
			this._dx = 0;
			this._dy = 0;
			this._motion_threshold = MOTION_THRESHOLD;			
		}

		return ret;
	}

	_canUnshowDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		return windows.length > 0 && windows.every(x => x.is_hidden())
	}

	_canShowDesktop() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		return windows.length > 0 && windows.some(x => !x.is_hidden())
	}

	_gestureEnd() {
		this._dx = 0;
		this._dy = 0;
		this._lastVertical = 0;
		this._motion_threshold = FIRST_MOTION_THRESHOLD;
		this._doAction('close-switcher');
		return Clutter.EVENT_STOP;
	}

	_cleanup() {
		global.stage.disconnect(this._gestureCallbackID);
	}

	// https://gitlab.gnome.org/GNOME/metacity/-/blob/master/src/core/screen.c#L2297
	async _sendKeyEvent(...keys) {
		let currentTime = Clutter.get_current_event_time();
		keys.forEach(key => this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.PRESSED));
		keys.forEach(key => this._virtualKeyboard.notify_keyval(currentTime, key, Clutter.KeyState.RELEASED));
	}
};

let timeSource = 'global'
/**
 * By default we use global.get_current_time, but in case it doesn’t work
 * we use GLib. Since these two are diferent, once we switch we cannot go back
 */
function getTime() {
	let time = 0;
	if (timeSource === 'global') {
		time = global.get_current_time();
		if (time == 0)
			timeSource = 'monotonic';
		else
			return time;
	}
	if (timeSource === 'monotonic') {
		return GLib.get_monotonic_time() / 1000;
	}
}

function enable() {
	gestureHandler = new TouchpadGestureAction(global.stage, dbusClient);
	dbusClient = new DbusClient.DbusClient();
	dbusClient.addListener(gestureHandler);
}


function disable() {
	gestureHandler._cleanup();
	gestureHandler = null;
	dbusClient.destroy();
	dbusClient = null;
}
