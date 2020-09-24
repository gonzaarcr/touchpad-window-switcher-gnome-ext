#!/usr/bin/python3
# -*- coding: utf-8 -*-

import dbus
import dbus.service

import libinput

import threading
import time
import os

import service

li = libinput.LibInput()
device = None

def setup_device():
	md = '/dev/input/event%s'
	global device
	for i in range(20):
		try:
			device = li.path_add_device(md % i)
			if device.has_capability(libinput.constant.DeviceCapability.GESTURE):
				return
			li.path_remove_device(device)
			device = None
		except:
			pass


class TouchpadListener(object):
	"""
	Read the events on the event loop (from libinput),
	and sends it to the dbus
	"""

	events_listeners = [
		libinput.constant.Event.GESTURE_SWIPE_BEGIN,
		libinput.constant.Event.GESTURE_SWIPE_UPDATE,
		libinput.constant.Event.GESTURE_SWIPE_END
	]

	FIRST_MOTION_THRESHOLD = 25
	MOTION_THRESHOLD = 50

	def __init__(self, dbus_session):
		super(TouchpadListener, self).__init__()
		self.dbus_session = dbus_session
		self._threshold = self.FIRST_MOTION_THRESHOLD

	def loop(self, event):
		if event.type == libinput.constant.Event.GESTURE_SWIPE_END:
			self._threshold = self.FIRST_MOTION_THRESHOLD
			self.dbus_object.EchoSignal(0, 0)
			return

		if event.type == libinput.constant.Event.GESTURE_SWIPE_BEGIN:
			self._dx = 0
			self._dy = 0

		gesture = event.get_gesture_event()
		fingers = gesture.get_finger_count()
		if fingers != 3 and fingers != 4:
			return

		self._dx += gesture.get_dx()
		self._dy += gesture.get_dy()
		magnitude = max(abs(self._dx), abs(self._dy))
		if magnitude < self._threshold:
			return

		self._threshold = self.MOTION_THRESHOLD
		rounded_direction = 0
		if abs(self._dx) > abs(self._dy):
			rounded_direction += 0 if self._dx > 0 else 2
		else:
			rounded_direction += 1 if self._dy > 0 else 3

		self.dbus_object.EchoSignal(fingers, rounded_direction)
		# time = gesture.get_time()
		self._dx = 0
		self._dy = 0

	def run(self):
		time.sleep(1)
		self.dbus_object = self.dbus_session.get_object(service.TpService.BUS_NAME, service.TpService.BUS_PATH)
		for event in li.get_event():
			if event.type in self.events_listeners:
				self.loop(event)


def start_service():
	args = 'python3 ./service.py'

	proc = threading.Thread(target=os.system, args=[args])
	proc.start()


def main():
	setup_device()
	if device == None:
		print('Error detecting touchpad')
		return
	start_service()

	tpl = TouchpadListener(dbus.SessionBus())
	tpl.run()


if __name__ == "__main__":
	main()
