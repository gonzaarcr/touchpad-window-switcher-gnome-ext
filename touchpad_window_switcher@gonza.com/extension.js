
const { Clutter, GLib, Meta, St } = imports.gi;

const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const MyAltTab = Me.imports.myAltTab;
const DbusClient = Me.imports.dbusClient;
const Desktop = Me.imports.desktop;
const OverviewCleaner = Me.imports.overviewCleaner;

let gestureHandler = null;
let dbusClient = null;

let popup = null;

const MOTION_THRESHOLD = 200;
const FIRST_MOTION_THRESHOLD = 100;


function log(msg) {
	const debug = false;
	if (debug)
		global.log('[TOUCHPAD_SWITCHER] ' + msg);
}

// Meta.is_wayland_compositor
const TouchpadGestureAction = class {

	constructor() {
		if (Clutter.DeviceManager) {
			// Fallback for GNOME 3.32 and 3.34
			this._gestureCallbackID = global.stage.connect('captured-event', this._handleEvent.bind(this));
		} else {
			// For GNOME >= 3.36
			this._gestureCallbackID = global.stage.connect('captured-event::touchpad', this._handleEvent.bind(this));
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
		this._overviewFocusIdx = null;

		this._desktop = Meta.is_wayland_compositor() ? new Desktop.WaylandShowDesktop() : new Desktop.XShowDesktop();
	}

	touchpadEvent(fingers, direction) {
		if (fingers === 0) {			
			this._gestureEnd();
			return
		}
		let dir = this.DIRECTION_LOOKUP[direction];
		if (fingers === 3) {
			this._gestureUpdate(dir);
		} else if (fingers === 4) {
			this._changeWorkspace(dir);
		}
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

		let rounded_direction = 0;
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
				this._desktop.unshowDesktop()
				break;
			case 'unshow-desktop':
				this._desktop.showDesktop()
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
				this._navigateOverview(1);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.LEFT) {
			if (!Main.overview.visible) {
				this._doAction('move-left');
			} else {
				this._navigateOverview(-1);
			}
			ret = Clutter.EVENT_STOP;
		} else if (dir == Meta.MotionDirection.UP) {
			if (popup == null && (getTime() - this._lastVertical) > 1000) {
				this._lastVertical = getTime();
				if (this._desktop.canUnshowDesktop()) {
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
					this._hideOverview();
					ret = Clutter.EVENT_STOP;
				} else if (this._desktop.canShowDesktop()) {
					log('show-desktop');
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

	_gestureEnd() {
		this._dx = 0;
		this._dy = 0;
		this._lastVertical = 0;
		this._motion_threshold = FIRST_MOTION_THRESHOLD;
		// this._overviewFocusIdx = null;
		this._doAction('close-switcher');
		return Clutter.EVENT_STOP;
	}

	_cleanup() {
		global.stage.disconnect(this._gestureCallbackID);
	}

	async _changeWorkspace(dir) {
		let diff = 0;
		switch (dir) {
			case Meta.MotionDirection.RIGHT:
			case Meta.MotionDirection.DOWN:
				diff = -1;
			break;
			case Meta.MotionDirection.LEFT:
			case Meta.MotionDirection.UP:
				diff = 1;
			break;
		}
		let newIndex = global.workspace_manager.get_active_workspace_index() + diff;

		let wm = global.workspace_manager;
		if (newIndex >= 0 && newIndex < wm.n_workspaces) {
			wm.get_workspace_by_index(newIndex).activate(global.get_current_time());
		}
	}

	// direction: 1 fordward, -1 backward
	async _navigateOverview(direction) {
		let _dir = undefined;
		if (direction === 1)
			_dir = St.DirectionType.TAB_FORWARD;
		else if (direction === -1)
			_dir = St.DirectionType.TAB_BACKWARD;

		let workspaceIdx = global.workspace_manager.get_active_workspace_index();
		let workspace = Main.overview.viewSelector._workspacesDisplay._getPrimaryView().get_children()[workspaceIdx];
		let n = workspace.get_focus_chain().length;
		if (n === 0)
			return

		if (this._overviewFocusIdx === null) {
			// With windows order by last used this is not necesary
			// let currentWin = global.workspace_manager.get_active_workspace().list_windows()[0];
			// this._overviewFocusIdx = workspace._lookupIndex(currentWin);
			this._overviewFocusIdx = 0;
		}
		this._overviewFocusIdx = (this._overviewFocusIdx + n) % n;
		let currentFocus = workspace.get_focus_chain()[this._overviewFocusIdx];
		let grab = workspace.navigate_focus(currentFocus, _dir, true);
		this._overviewFocusIdx += direction;
	}

	// If there’s a window selected, activated it.
	// Otherwise only close the overview
	async _hideOverview() {
		if (this._overviewFocusIdx === null) {
			Main.overview.hide();
		} else {
			let workspaceIdx = global.workspace_manager.get_active_workspace_index();
			let workspace = Main.overview.viewSelector._workspacesDisplay._getPrimaryView().get_children()[workspaceIdx];
			let win = workspace.get_focus_chain()[this._overviewFocusIdx];
			this._overviewFocusIdx = null;
			win._activate();
		}
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
	gestureHandler = new TouchpadGestureAction();
	dbusClient = new DbusClient.DbusClient();
	dbusClient.addListener(gestureHandler);

	OverviewCleaner.orderOverview();
}


function disable() {
	gestureHandler._cleanup();
	gestureHandler = null;
	dbusClient.destroy();
	dbusClient = null;

	OverviewCleaner.disorderOverview();
}
