'use strict';

const Gio = imports.gi.Gio;

const ifaceXml = `
<node>
	<interface name="com.gonzaarcr.tpgesture">
	<method name="EchoSignal">
		<arg type="u" direction="in" name="fingers"/>
		<arg type="u" direction="in" name="direction"/>
	</method>
	<signal name="TouchpadEvent">
		<arg name="fingers" type="u"/>
		<arg name="direction" type="u"/>
	</signal>
  </interface>
</node>`;

const TouchpadProxy = Gio.DBusProxy.makeProxyWrapper(ifaceXml);

const BUS_NAME = 'com.gonzaarcr.tpgesture';
const BUS_PATH = '/com/gonzaarcr/tpgesture';

var DbusClient = class {
	constructor() {
		this._listeners = [];
		this._proxy = TouchpadProxy(
			Gio.DBus.session,
			BUS_NAME,
			BUS_PATH,
			this._onProxyReady.bind(this)
		);
	}

	addListener(l) {
		this._listeners.push(l);
	}

	_onProxyReady(result, error) {
		this.handlerId = this._proxy.connectSignal('TouchpadEvent', this._onTouchpadEvent.bind(this));
	}

	_onTouchpadEvent(proxy, nameOwner, [fingers, direction]) {
		for (let l of this._listeners) {
			l.touchpadEvent(fingers, direction);
		}
	}

	destroy() {
		this.handlerId && this._proxy.disconnectSignal(this.handlerId);
	}
};
