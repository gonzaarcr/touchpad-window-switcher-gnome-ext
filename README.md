# Touchpad Window Switcher (Gnome extension)

Gnome extension that allows to switch windows like Windows with a touchpad gesture (3 fingers right-left).

Works on Wayland out of the box. To make it work on Xorg:

1. Download the `dbus_service` folder. And place it whereever you want (`/opt`?)
2. Install the dependencies: 

```
sudo apt install libinput-dev python3-pip
pip3 install python-libinput==0.1.0
```

3. Run the service with `python3 main.py`

Make sure the extension runs after the service, try disabling and enabling it on the extensions app if necesary. 

![Demo](https://raw.githubusercontent.com/gonzaarcr/touchpad-window-switcher-gnome-ext/doc-resources/output.gif "Demo")
