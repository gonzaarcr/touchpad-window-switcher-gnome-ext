#!/usr/bin/python3
# -*- coding: utf-8 -*-

import dbus
import dbus.service

from gi.repository import GLib
from dbus.mainloop.glib import DBusGMainLoop


class TpService(dbus.service.Object):

	BUS_PATH = '/com/gonzaarcr/tpgesture'
	BUS_NAME = 'com.gonzaarcr.tpgesture'

	def __init__(self):
		self.bus_name = dbus.service.BusName(self.BUS_NAME, bus=dbus.SessionBus())
		dbus.service.Object.__init__(self, self.bus_name, self.BUS_PATH)

	@dbus.service.signal(BUS_NAME, signature='uu')
	def TouchpadEvent(self, fingers, direction):
		pass

	@dbus.service.method(BUS_NAME)
	def Q(self):
		GLib.MainLoop().quit()


service = None

def run_service():
	global service
	service = TpService()
	try:
		GLib.MainLoop().run()
	except KeyboardInterrupt:
		GLib.MainLoop().quit()

def get_service():
	global service
	return service

def main():
	DBusGMainLoop(set_as_default=True)
	session_bus = dbus.SessionBus()

	if not session_bus.name_has_owner(TpService.BUS_NAME):
		run_service()


if __name__ == "__main__":
	main()
