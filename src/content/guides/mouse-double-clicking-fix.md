---
title: "Mouse Double Clicking on Single Click? How to Fix It"
h1: "Mouse Double-Clicking on a Single Click: How to Test and Fix It"
description: "Files open by themselves or drag-and-drop fails? Test your mouse for double-click faults online, then fix it: settings, cleaning, debounce and switch repair."
date: "2026-11-03"
tool: "dt:double-click-test"
tools: ["dt:mouse-test", "dt:keyboard-test", "dt:refresh-rate-test"]
faqs:
  - q: "Why does my mouse double-click when I click once?"
    a: "Most often the small switch inside the button is worn and 'bounces', sending two clicks. A too-sensitive double-click setting can also cause it."
  - q: "How do I test my mouse for double-clicking?"
    a: "Open the ZentaPDF Double-Click Test and click slowly 30 to 50 times. Any 'Faulty double-clicks' means the switch is sending extra clicks."
  - q: "Can a double-clicking mouse be fixed?"
    a: "Sometimes. Cleaning, raising the debounce time in the mouse software, or replacing the switch can fix it. Many mice are also under warranty."
  - q: "Is it the mouse or Windows?"
    a: "Test the mouse on another computer or test another mouse on yours. If the fault follows the mouse, the mouse is the problem."
---

You click once on a file and it opens. You try to drag a window and it drops halfway. Text gets selected when you only wanted to place the cursor. These are classic signs of a mouse that **double-clicks by itself**.

## 1. Test the mouse

Open the [Double-Click Test](/device-test/double-click-test/). Choose **Left button** and click slowly inside the box, 30 to 50 times, as you normally would.

- **Faulty double-clicks = 0:** the switch is fine. Check the Windows settings in step 2.
- **Faulty double-clicks above 0:** the mouse sent a second click less than 80 ms after you let go, faster than a person can click. The switch is bouncing; continue with steps 3 to 6.

You can also check all other buttons and the wheel in the [Mouse Click Test](/device-test/mouse-test/).

## 2. Check the Windows double-click setting

1. Open **Settings → Bluetooth & devices → Mouse → Additional mouse settings**.
2. On the **Buttons** tab, set **Double-click speed** to the middle.
3. Make sure **ClickLock** is turned off.

Also check **File Explorer → Options → General → Click items as follows**: it should be **Double-click to open an item**, not single-click.

## 3. Clean the button

Dust and oxidation on the switch contacts cause bouncing.

1. Unplug the mouse or remove the battery.
2. Blow **compressed air** around the edge of the button while clicking it many times.
3. Test again.

## 4. Raise the debounce time

Gaming mice let you set how long the mouse waits before accepting a new click ("debounce time"). In Logitech G Hub, Razer Synapse, SteelSeries GG or your brand's app, raise the debounce time slightly (for example from 4 ms to 8 to 12 ms) and test again.

## 5. Try another USB port or receiver position

For wireless mice, move the receiver closer (use a USB extension) and replace the battery. Weak signals rarely cause double clicks, but they can cause missed or delayed clicks.

## 6. Repair or replace

If the test still shows faulty double-clicks, the switch inside is worn:

- **Under warranty?** Many brands replace mice for this fault, take a screenshot of the test result.
- **Comfortable with soldering?** The switch (often an Omron switch) can be replaced for very little money.
- **New mouse:** mice with **optical switches** don't have this problem because they don't use metal contacts.

## Quick checklist

- Faulty double-clicks in the test?
- Double-click speed and ClickLock settings correct?
- Cleaned the button and raised debounce time?
- Still faulty → warranty, switch repair or a new mouse.

Keyboard problems too? Use the [Keyboard Tester](/device-test/keyboard-test/).
