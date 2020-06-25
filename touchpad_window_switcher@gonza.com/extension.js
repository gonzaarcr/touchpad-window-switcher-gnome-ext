
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Signals = imports.signals;
const SwitcherPopup = imports.ui.switcherPopup;

const AltTab = imports.ui.altTab;

let gestureHandler = null;


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
			1: Meta.MotionDirection.UP,
			2: Meta.MotionDirection.LEFT,
			3: Meta.MotionDirection.DOWN
		};
		this._actionCallbackID = this.connect('activated', Lang.bind(this, this._doAction));
		this.defaultDelay = SwitcherPopup.SwitcherPopup.POPUP_DELAY_TIMEOUT;
		this.defaultInit = SwitcherPopup.SwitcherPopup.prototype._init;
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
		if (rounded_direction == -1) {
			rounded_direction = 3;
		} else if (rounded_direction == -2) {
			rounded_direction = 2;
		}
		let dir = this.DIRECTION_LOOKUP[rounded_direction];

		global.log("_handleEvent");
		switch (event.get_gesture_phase()) {
			case Clutter.TouchpadGesturePhase.BEGIN:
				return this._gestureStarted();

			case Clutter.TouchpadGesturePhase.UPDATE:
				return this._gestureUpdate(dir, magnitude);

			default: //CANCEL or END
				return this._gestureEnd();
		}

		return Clutter.EVENT_STOP;
	},

	_gestureStarted: function() {
		SwitcherPopup.SwitcherPopup.POPUP_DELAY_TIMEOUT = 0
		// SwitcherPopup.SwitcherPopup.prototype._init = () => { this.defaultInit(); };
		this.emit('activated', 'open-switcher');

		return Clutter.EVENT_STOP;
	},

	_doAction: function(sender, action) {
		switch (action) {
			case 'open-switcher':
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Alt_L, Clutter.KeyState.PRESSED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab , Clutter.KeyState.PRESSED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab , Clutter.KeyState.RELEASED);
				global.log("open-switcher");
				break;
			case 'move-right':
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab, Clutter.KeyState.PRESSED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab, Clutter.KeyState.RELEASED);
				global.log("move-right");
				this._dx = 0;
				this._dy = 0;
				break;
			case 'move-left':
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab, Clutter.KeyState.PRESSED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Tab, Clutter.KeyState.RELEASED);
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
				global.log("move-left");
				this._dx = 0;
				this._dy = 0;
				break;
			case 'close-switcher':
				this._virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Alt_L, Clutter.KeyState.RELEASED);
				global.log("close-switcher");
				this._dx = 0;
				this._dy = 0;
				break;
			default:
				break;
		}
	},

	_gestureUpdate: function(dir, motion) {
		const MOTION_THRESHOLD = 200;
		global.log("_gestureUpdate");

		if (dir == Meta.MotionDirection.RIGHT && motion > MOTION_THRESHOLD) {
			this.emit('activated', 'move-right');
			return Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.LEFT && motion > MOTION_THRESHOLD) {
			this.emit('activated', 'move-left');
			return Clutter.EVENT_STOP;
		} else {
			return Clutter.EVENT_PROPAGATE;
		}
	},

	_gestureEnd: function() {
		SwitcherPopup.SwitcherPopup.POPUP_DELAY_TIMEOUT = this.defaultDelay;
		// SwitcherPopup.SwitcherPopup.prototype._init = this.defaultInit;
		this.emit('activated', 'close-switcher');
		return Clutter.EVENT_STOP;
	},

	_cleanup: function() {
		global.stage.disconnect(this._gestureCallbackID);
		this.disconnect(this._actionCallbackID);
		// just to be sure
		SwitcherPopup.SwitcherPopup.POPUP_DELAY_TIMEOUT = this.defaultDelay;
		// SwitcherPopup.SwitcherPopup.prototype._init = this.defaultInit;
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
