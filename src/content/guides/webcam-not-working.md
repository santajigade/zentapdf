---
title: "Webcam Not Working or Not Detected? How to Fix It"
h1: "Webcam Not Working or Not Detected: How to Fix It"
description: "Black screen or 'no camera found'? Test your webcam online, then fix privacy settings, camera switches, drivers and app permissions on Windows and Mac."
date: "2026-11-03"
tool: "dt:webcam-test"
tools: ["dt:mic-test", "dt:internet-speed-test", "dt:speaker-test"]
faqs:
  - q: "Why is my webcam showing a black screen?"
    a: "Usually a privacy shutter is closed, a camera key has turned the camera off, or another app is already using the camera."
  - q: "How do I check if my webcam is working?"
    a: "Open the ZentaPDF Webcam Test and click Start. If you see your picture, the webcam works and the problem is in the app's camera setting."
  - q: "Why is my laptop camera not detected?"
    a: "The camera may be disabled in privacy settings or Device Manager, turned off with a function key, or missing its driver."
  - q: "How do I fix the webcam on a Mac?"
    a: "Allow your app under System Settings → Privacy & Security → Camera, close other apps using the camera, and restart the Mac."
---

You join a video call and see only a black box, or the app says "no camera found". Here is how to find the cause and fix it quickly on Windows and Mac.

## 1. Test the camera

Open the [Webcam Test](/device-test/webcam-test/) and click **Start webcam test**.

- **You see yourself:** the camera works. The problem is the app's camera setting, see step 6.
- **Black picture:** check the shutter and camera key (step 2).
- **"No camera found" or blocked:** go to steps 3 to 5.

## 2. Check the shutter and camera key

- Many laptops have a **sliding privacy shutter** above the screen. Slide it open.
- Some have a **camera key** (F8, F10 or a key with a camera icon) that turns the camera off. Press it once and try again.
- Lenovo, HP and Dell laptops may show a "camera off" message when you press it.

## 3. Allow camera access

**Windows 11/10:** Settings → Privacy & security → Camera. Turn on **Camera access**, **Let apps access your camera** and **Let desktop apps access your camera**.

**Mac:** System Settings → Privacy & Security → Camera. Turn on your browser and your call app.

**In the browser:** click the camera or lock icon in the address bar and choose **Allow**.

## 4. Close other apps using the camera

Only one app can use the camera at a time on many computers. Close Zoom, Teams, Skype, OBS or the Camera app, then test again.

## 5. Check the driver (Windows)

1. Right-click Start → **Device Manager**.
2. Open **Cameras** (or **Imaging devices**).
3. If the camera has a down-arrow icon, right-click → **Enable device**.
4. Otherwise right-click → **Update driver**, or **Uninstall device** and restart.

No camera listed at all? For USB webcams, try another USB port and cable. For laptop cameras, check the manufacturer's support site for a driver.

## 6. Choose the right camera in your app

- **Zoom:** Settings → Video → Camera.
- **Teams:** Settings → Devices → Camera.
- **Google Meet:** Settings (gear) → Video.

If a virtual camera (OBS Virtual Camera, Snap Camera) is selected, switch to your real webcam.

## 7. Improve a blurry or dark picture

- Face a window or lamp, light from behind makes your face dark.
- Clean the lens with a soft cloth.
- In the Webcam Test, try **Full HD** in "Try resolution" to see the best quality your camera supports.
- Low light makes cameras drop their frame rate; more light gives a smoother picture.

## 8. Restart

A restart frees a camera that a crashed app is still holding. Then run the [Webcam Test](/device-test/webcam-test/) again.

## Quick checklist

- Shutter open and camera key on?
- Camera allowed in privacy settings and in the browser?
- No other app using it?
- Correct camera selected in the call app?

Before your call, also check your [microphone](/device-test/mic-test/) and [internet speed](/device-test/internet-speed-test/).
