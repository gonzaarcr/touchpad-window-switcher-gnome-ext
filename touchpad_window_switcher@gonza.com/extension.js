
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const MyAltTab = Me.imports.myAltTab;

let gestureHandler = null;

let popup = null;

const MOTION_THRESHOLD = 200;


const TouchpadGestureAction = new Lang.Class({
	Name: 'TouchpadGestureAction',

	_init: function(actor) {

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
		this._actionCallbackID = this.connect('activated', Lang.bind(this, this._doAction));
		this._lastVertical = 0;
	},

	_handleEvent: function(actor, event) {
		// Only look for touchpad swipes
		if (event.type() != Clutter.EventType.TOUCHPAD_SWIPE)
			return Clutter.EVENT_PROPAGATE;

		// Only look for three finger gestures
		if (event.get_touchpad_gesture_finger_count() != 3)
			return Clutter.EVENT_PROPAGATE;

		let [dx, dy] = event.get_gesture_motion_delta();

		this._dx += dx;
		this._dy += dy;

		let magnitude = Math.sqrt(Math.pow(this._dy, 2) + Math.pow(this._dx, 2));

		let rounded_direction = Math.round(Math.atan2(this._dy, this._dx) / Math.PI * 2);
		if (rounded_direction < 0)
			rounded_direction += 4;

		let dir = this.DIRECTION_LOOKUP[rounded_direction];

		switch (event.get_gesture_phase()) {
			case Clutter.TouchpadGesturePhase.BEGIN:
				return this._gestureUpdate(dir, magnitude);

			case Clutter.TouchpadGesturePhase.UPDATE:
				return this._gestureUpdate(dir, magnitude);

			default: // CANCEL or END
				return this._gestureEnd();
		}

		return Clutter.EVENT_STOP;
	},

	_doAction: function(sender, action) {
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
				this._dx = 0;
				this._dy = 0;
				break;
			case 'close-switcher':
				if (popup != null) {
					popup._finish(global.display.get_current_time_roundtrip());
					popup = null;
				}
				break;
			case 'show-desktop':
				this._showDesktop();
				break;
			case 'unshow-desktop':
				// gsettings set org.gnome.desktop.interface enable-animations true
				this._unshowDesktop();
				break;
			default:
				break;
		}
	},

	_createSwitcher: function() {
		popup = new MyAltTab.WindowSwitcherPopup();
		if (!popup.show(false, '', 0)) {
			tabPopup.destroy();
		}
	},

	_gestureUpdate: function(dir, motion) {
		if (motion < MOTION_THRESHOLD)
			return Clutter.EVENT_PROPAGATE;

		let ret = Clutter.EVENT_PROPAGATE;

		if (dir == Meta.MotionDirection.RIGHT) {
			if (!Main.overview.visible) {
				this.emit('activated', 'move-right');
			} else {
				Main.overview.viewSelector._workspacesDisplay._getPrimaryView().navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.LEFT) {
			if (!Main.overview.visible) {
				this.emit('activated', 'move-left');
			} else {
				Main.overview.viewSelector._workspacesDisplay._getPrimaryView().navigate_focus(null, St.DirectionType.TAB_BACKWARD, false);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.UP) {
			global.log(global.get_current_time() - this._lastVertical);
			if (popup == null && (global.get_current_time() - this._lastVertical) > 1000) {
				this._lastVertical = global.get_current_time();
				if (this._canUnshowDesktop()) {
					this.emit('activated', 'unshow-desktop');
					ret = Clutter.EVENT_STOP;
				} else if (!Main.overview.visible) {
					Main.overview.show();
					ret = Clutter.EVENT_STOP;
				}
			}
		} else if (dir == Meta.MotionDirection.DOWN) {
			global.log(global.get_current_time() - this._lastVertical);
			if (popup == null && (global.get_current_time() - this._lastVertical) > 1000) {
				this._lastVertical = global.get_current_time();
				if (Main.overview.visible) {
					Main.overview.hide();
					ret = Clutter.EVENT_STOP;
				} else {
					this.emit('activated', 'show-desktop');
					ret = Clutter.EVENT_STOP;
				}
			}
		}
		if (ret === Clutter.EVENT_STOP)
			this._dx = 0;
			this._dy = 0;

		return ret;
	},

	_canUnshowDesktop: function() {
		return !Main.overview.visible && this.toMaximize.length > 0 && this._isShowingDesktop();
	},

	_isShowingDesktop: function() {
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		global.log(windows.map(x => x.minimized).join(', '));
		return windows.every(x => x.minimized);
	},

	_showDesktop: function() {
		this._disableAnimations();
		// TODO para distintos workspaces
		this.toMaximize = [];
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		for (let i = 0; i < windows.length; i++) {
			if (!windows[i].minimized) {
				this.toMaximize.push(windows[i]);
				windows[i].minimize();
			}
		}
	},

	_unshowDesktop: function() {
		this._disableAnimations();
		let windows = global.workspace_manager.get_active_workspace().list_windows();
		for (let i = 0; i < windows.length; i++) {
			if (this.toMaximize.indexOf(windows[i]) !== -1)
				windows[i].unminimize();
		}
		this.toMaximize = [];
		this._restoreAnimations();
	},

	_disableAnimations: function() {
		this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
		this._defaultAnimation = this._settings.get_boolean('enable-animations');
		this._settings.set_boolean('enable-animations', false);
	},

	_restoreAnimations: function() {
		if (this._defaultAnimation)
			this._settings.set_boolean('enable-animations', true);
		this._settings = null;
		this._defaultAnimation = null;
	},

	_gestureEnd: function() {
		this.emit('activated', 'close-switcher');
		return Clutter.EVENT_STOP;
	},

	_cleanup: function() {
		global.stage.disconnect(this._gestureCallbackID);
		this.disconnect(this._actionCallbackID);
	}
});


function enable() {
	Signals.addSignalMethods(TouchpadGestureAction.prototype);
	gestureHandler = new TouchpadGestureAction(global.stage);
}


function disable() {
	gestureHandler._cleanup();
	gestureHandler = null;
}
