# Touchpad Window Switcher (Gnome extension)

Gnome extension that allows to switch windows like Windows with a touchpad gesture (3 fingers right-left).

Capabilities:
  - Swipe with 3 fingers right-left to switch windows
  - Swipe with 3 fingers up-down to show desktop/overview
  - Swipe with 4 fingers to change worksapce

Works on Wayland out of the box. To make it work on Xorg:

1. Download the `dbus_service` folder. And place it whereever you want (`/opt`?)
2. Install the dependencies: 

```
sudo apt install libinput-dev python3-pip
pip3 install python-libinput==0.1.0
```

3. Add the user to the _input_ group with `sudo gpasswd -a $USER input`
4. Run the service with `python3 main.py`

Optional: of you want the show desktop to work set up the Super+D keybinding with `gsettings set org.gnome.desktop.wm.keybindings show-desktop '<Super>d'`.

Make sure the extension runs after the service, try disabling and enabling it on the extensions app if necesary. 

![Demo](https://raw.githubusercontent.com/gonzaarcr/touchpad-window-switcher-gnome-ext/doc-resources/output.gif "Demo")
