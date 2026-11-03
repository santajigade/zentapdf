---
title: "Mic Not Working on Windows 11/10? 9 Quick Fixes"
h1: "Microphone Not Working on Windows 11 or 10 – 9 Quick Fixes"
description: "Mic not working in Zoom, Teams or Discord? Test it online, then fix it step by step: privacy settings, input device, volume, drivers and app permissions."
date: "2026-11-03"
tool: "dt:mic-test"
tools: ["dt:webcam-test", "dt:speaker-test", "dt:internet-speed-test"]
faqs:
  - q: "Why is my mic not working on Windows 11?"
    a: "The most common reasons are blocked microphone privacy settings, the wrong input device selected, a muted or very low input volume, or another app using the microphone."
  - q: "How do I test my microphone on Windows?"
    a: "Open the ZentaPDF Mic Test, click Start and speak. If the level bar moves, Windows can hear your microphone and the problem is in the app's settings."
  - q: "Why does my mic work in one app but not another?"
    a: "Each app has its own microphone choice. Open the app's audio settings and select the same microphone that works elsewhere."
  - q: "How do I reset microphone settings on Windows?"
    a: "Run the Recording Audio troubleshooter in Settings, then update or reinstall the audio driver in Device Manager."
---

Your colleagues can't hear you on Teams, Discord shows no voice activity, or your online exam says "no microphone found". Microphone problems on Windows are common — and almost always fixable in a few minutes. Work through these steps in order.

## 1. Test the microphone first

Before changing settings, find out where the problem is. Open the [Mic Test](/device-test/mic-test/), click **Start mic test** and allow access. Speak normally.

- **The level bar moves:** your microphone and Windows work. The problem is the app (Zoom, Teams, Discord) — jump to step 7.
- **The bar doesn't move:** the problem is Windows, the driver or the microphone itself — continue with step 2.

## 2. Allow microphone access in privacy settings

Windows can block all apps from using the microphone.

1. Open **Settings → Privacy & security → Microphone**.
2. Turn on **Microphone access**.
3. Turn on **Let apps access your microphone** and **Let desktop apps access your microphone**.
4. Check that your browser and your call app are allowed.

## 3. Choose the right input device

If you have a headset, a webcam and a laptop, Windows may be listening to the wrong one.

1. Open **Settings → System → Sound**.
2. Under **Input**, choose your microphone.
3. Speak and watch the **Input volume** bar.

## 4. Check the volume and mute switches

- Many headsets have a **mute button** or switch on the cable or ear cup.
- Some laptops have a **mic mute key** (often F4 or F8 with a crossed-out microphone).
- In **Settings → System → Sound → your microphone**, set **Input volume** to around 75–100.

## 5. Plug it in properly

- For 3.5 mm headsets, use the **microphone** jack (often pink) or the combined headset jack. Some laptops need a splitter for headsets with two plugs.
- For USB microphones, try another USB port — preferably directly on the computer, not a hub.
- Test the microphone on another device to rule out a broken cable.

## 6. Update or reinstall the audio driver

1. Right-click the Start button and open **Device Manager**.
2. Expand **Audio inputs and outputs**.
3. Right-click your microphone → **Update driver**. If that doesn't help, choose **Uninstall device** and restart the PC — Windows reinstalls it automatically.

You can also run the built-in troubleshooter: **Settings → System → Troubleshoot → Other troubleshooters → Recording Audio**.

## 7. Fix the app settings (Zoom, Teams, Discord, Meet)

Each app chooses its own microphone:

- **Zoom:** Settings → Audio → Microphone.
- **Teams:** Settings → Devices → Microphone.
- **Discord:** User Settings → Voice & Video → Input Device. Also check Input Sensitivity.
- **Google Meet / browser:** click the lock icon in the address bar and allow the microphone.

Select the same microphone that worked in the Mic Test.

## 8. Close apps that use the microphone

Only one app at a time can sometimes use the microphone in **exclusive mode**. Close other call or recording apps. To turn exclusive mode off: Control Panel → Sound → Recording → your microphone → Properties → Advanced → untick **Allow applications to take exclusive control**.

## 9. Restart and test again

A simple restart clears stuck audio services. After restarting, run the [Mic Test](/device-test/mic-test/) again and record 5 seconds to hear how you sound. If the bar still doesn't move with a known-good microphone, the computer's audio jack or chip may be faulty.

## Quick checklist

- Mic Test shows sound? → fix the app's microphone setting.
- No sound? → privacy settings, input device, mute switches, cable, driver.
- Sound is quiet or noisy? → raise input volume, move closer, turn on noise suppression in your call app.

Also test your [camera](/device-test/webcam-test/), [speakers](/device-test/speaker-test/) and [internet speed](/device-test/internet-speed-test/) before an important call.
