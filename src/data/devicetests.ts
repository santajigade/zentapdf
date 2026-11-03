// Device Test hub: free browser-based hardware & internet tests (zentapdf.com/device-test/)
export interface DTSection { h: string; p?: string[]; list?: string[] }
export interface DeviceTest {
  slug: string; name: string; icon: string; color: string; short: string; live: boolean;
  title?: string; metaDescription?: string; h1?: string; intro?: string;
  howToName?: string; steps?: string[]; sections?: DTSection[]; trouble?: string[];
  faqs?: { q: string; a: string }[]; related?: string[];
}

export const HUB = {
  title: 'Device Test Online – Free Keyboard, Mic, Webcam & Speed Tests',
  description: 'Free online device tests: check your keyboard, mouse, microphone, webcam, speakers and internet speed in your browser. No download, no sign-up, works on any device.',
};

export const deviceTests: DeviceTest[] = [
  {
    slug: 'keyboard-test', name: 'Keyboard Tester', icon: 'keyboard', color: '#5b5bd6', live: true,
    short: 'Press every key and see which ones work.',
    title: 'Keyboard Tester – Test All Keys Online Free',
    metaDescription: 'Test every key on your keyboard online for free. Keys light up green when they work, with key codes, anti-ghosting check and Windows, laptop and Mac layouts.',
    h1: 'Keyboard Tester – Test All Keys Online',
    intro: 'Check every key on your keyboard in seconds — free, no download. Press a key and it turns green on the on-screen keyboard, so you can quickly spot keys that are dead, sticky or wrongly mapped. Works for desktop, laptop and Mac keyboards, wired or wireless.',
    howToName: 'How to test your keyboard',
    steps: [
      'Click "Start keyboard test" (or click on the keyboard picture).',
      'Choose your layout: Full keyboard, Laptop or Mac.',
      'Press every key once — each working key turns green.',
      'Hold several keys together to check how many can be pressed at once (anti-ghosting).',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'Green key: the key works and sends a signal to your computer.',
        'Blue key: the key is being held down right now. A key that stays blue after you let go is stuck.',
        'Grey key: not pressed yet — or not working. Press it firmly a few times.',
        '"Most keys at once": how many keys your keyboard can register together. Office keyboards usually manage 2–6; gaming keyboards with N-key rollover can do 10 or more.',
        'Code and keyCode: technical names your browser receives. Useful when a key types the wrong character.',
      ] },
      { h: 'When to use a keyboard tester', p: [
        'Use it before buying a used laptop or keyboard, after spilling a drink, when a key stops typing, or when gaming keys don\'t respond while you hold others. It also helps to check a new mechanical keyboard or a key you just replaced.',
        'The test only listens while the keyboard area is active, so keys like Space and the arrow keys won\'t scroll the page. Click outside the keyboard to stop.',
      ] },
    ],
    trouble: [
      'A key doesn\'t turn green: press it several times, then clean under it with compressed air. Test the keyboard on another computer to see if the problem is the keyboard or the computer.',
      'Many keys don\'t work: check the cable or Bluetooth connection and the battery, and try a different USB port.',
      'Wrong characters appear: your computer may use a different keyboard language. Check Settings → Time & language → Language (Windows) or System Settings → Keyboard (Mac).',
      'Fn, Windows + L, media and brightness keys don\'t show: these are handled by the computer itself and never reach a website. That is normal.',
      'Keys repeat or "chatter": a worn switch can send double presses. On mechanical keyboards the switch can often be cleaned or replaced.',
    ],
    faqs: [
      { q: 'How do I check if all my keyboard keys are working?', a: 'Open this keyboard tester, click Start and press every key once. Every key that works turns green. Keys that stay grey are not sending a signal.' },
      { q: 'Can I test a laptop keyboard?', a: 'Yes. Choose the "Laptop" layout. Some laptop keys like Fn are handled by the laptop itself and cannot be detected by any website.' },
      { q: 'What is keyboard ghosting?', a: 'Ghosting is when pressing several keys at once makes some of them not register. Hold 4–6 keys together and look at "Most keys at once" to check your keyboard.' },
      { q: 'Does this work with Mac keyboards?', a: 'Yes. Choose the "Mac" layout to see Cmd, Option and Control labels.' },
      { q: 'Is anything I type saved?', a: 'No. The keys are only shown on your screen and are not stored or sent anywhere.' },
    ],
    related: ['mouse-test', 'mic-test', 'webcam-test'],
  },
  {
    slug: 'mouse-test', name: 'Mouse Click Test', icon: 'mouse', color: '#e5484d', live: true,
    short: 'Check left, right, middle, side buttons and scroll wheel.',
    title: 'Mouse Click Test – Test Mouse Buttons & Scroll Online',
    metaDescription: 'Test your mouse online for free: left, right and middle click, side buttons, scroll wheel and double-click faults. See every click counted live. No download.',
    h1: 'Mouse Click Test – Test Every Button and the Scroll Wheel',
    intro: 'Make sure every part of your mouse works: left and right click, the middle (wheel) button, the side back/forward buttons and scrolling. Each button lights up on the mouse picture and is counted, and the test warns you if a button seems to double-click by itself.',
    howToName: 'How to test your mouse',
    steps: [
      'Move your mouse pointer into the test box.',
      'Click the left, right and middle buttons, and the side buttons if your mouse has them.',
      'Scroll up and down with the wheel.',
      'Watch the counters: each working button turns green on the picture and its count goes up.',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'A button turns blue while you hold it and green once it has worked.',
        'Each click adds 1 to its counter. If one click adds 2, the switch is worn ("double-click problem").',
        'Scroll up / down counts each step of the wheel. Jumps in the wrong direction mean a dirty or worn wheel sensor.',
        'Double-clicks shows how many double-clicks were detected and the time between your last two left clicks.',
      ] },
      { h: 'Common mouse problems', p: [
        'The most common fault is a left button that double-clicks when you click once. It happens when the small switch inside wears out. This test warns you when two clicks arrive less than 60 milliseconds apart — faster than a human can click.',
        'Side buttons (back/forward) are used by browsers and games. If they don\'t show here, your mouse software may have assigned them to another function.',
      ] },
    ],
    trouble: [
      'No clicks counted: make sure the pointer is inside the test box. For wireless mice, check the battery and receiver.',
      'One click counts as two: clean the button with compressed air; if it continues, the switch needs replacing or the mouse is worn.',
      'Side buttons do nothing: open the mouse software (Logitech G Hub, Razer Synapse…) and set them to "Back" and "Forward".',
      'Scroll wheel jumps: clean around the wheel and test on another computer.',
      'Right-click opens a menu elsewhere: inside the test box the normal menu is turned off so you can test freely.',
    ],
    faqs: [
      { q: 'How do I test if my mouse is double-clicking?', a: 'Click the left button once at a time. If the counter sometimes goes up by two, or a warning appears, the mouse is double-clicking by itself.' },
      { q: 'Can I test the mouse side buttons?', a: 'Yes. Press the back and forward side buttons inside the test box and they light up on the picture.' },
      { q: 'Does this work with a touchpad?', a: 'Yes, tap and two-finger clicks on most touchpads are detected as left and right clicks, and two-finger scrolling counts as scrolling.' },
      { q: 'Do I need to install anything?', a: 'No. The test runs in your browser on Windows, Mac, Linux and Chromebook.' },
    ],
    related: ['keyboard-test', 'speaker-test', 'internet-speed-test'],
  },
  {
    slug: 'mic-test', name: 'Mic Test', icon: 'mic', color: '#30a46c', live: true,
    short: 'See your microphone level live and record a short clip.',
    title: 'Mic Test – Check Your Microphone Online Free',
    metaDescription: 'Test your microphone online for free. See a live level meter and waveform, pick the right mic, record 5 seconds and play it back. Nothing is uploaded.',
    h1: 'Mic Test – Check Your Microphone Online',
    intro: 'Find out in seconds whether your microphone works — before a Zoom, Teams or Google Meet call, an online exam or a gaming session. Speak and watch the level meter and waveform move, choose the right microphone if you have several, and record a short clip to hear how you sound. The sound stays on your device — nothing is recorded or uploaded.',
    howToName: 'How to test your microphone',
    steps: [
      'Click "Start mic test" and allow microphone access when your browser asks.',
      'Speak normally — the green level bar and the waveform should move.',
      'If you have several microphones, choose one from the list.',
      'Click "Record 5 seconds", then play it back to hear your voice quality.',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'Level meter: green is a normal speaking level, yellow is loud and red means too loud (it may sound distorted).',
        'Input level in dB: around −30 to −15 dB while speaking is good. Below −50 dB means the microphone is very quiet or muted.',
        'Sample rate: 44.1 or 48 kHz is standard and good for calls and recordings.',
        'Microphone name: shows which device the browser is using — useful when a headset or webcam mic is picked by mistake.',
      ] },
      { h: 'Noise suppression and echo cancellation', p: [
        'Video-call apps clean up your voice with noise suppression, echo cancellation and automatic volume. The test starts with these off so you hear your real microphone. Tick the option to hear how you will sound in a typical call.',
      ] },
    ],
    trouble: [
      'Access blocked: click the lock or microphone icon in the address bar, set Microphone to "Allow" and reload the page.',
      'No sound: check that the mic is not muted (headset mute switch, keyboard mute key) and that the right microphone is chosen in the list.',
      'Windows: Settings → System → Sound → Input — choose your microphone and check the volume. Also check Settings → Privacy → Microphone and allow apps and browsers.',
      'Mac: System Settings → Privacy & Security → Microphone — allow your browser.',
      '"Used by another app": close Zoom, Teams, Discord or other apps that may be holding the microphone.',
      'Very quiet: move closer, raise the input volume in your sound settings, or turn on "Noise suppression & echo cancellation" to use automatic volume.',
    ],
    faqs: [
      { q: 'How do I know if my microphone is working?', a: 'Click Start, allow access and speak. If the level bar moves and "Your microphone is working" appears, it works. Record 5 seconds and play it back to check the quality.' },
      { q: 'Is my voice recorded or sent anywhere?', a: 'No. The sound is processed in your browser only. The 5-second recording stays on your device and disappears when you close the page.' },
      { q: 'Why does my browser ask for permission?', a: 'Browsers always ask before a website can use your microphone. You can remove the permission at any time in the browser settings.' },
      { q: 'Can I test a headset or USB microphone?', a: 'Yes. Plug it in, start the test and choose it from the Microphone list.' },
      { q: 'Does it work on phones?', a: 'Yes, on Android and iPhone in Chrome or Safari.' },
    ],
    related: ['webcam-test', 'speaker-test', 'keyboard-test'],
  },
  {
    slug: 'webcam-test', name: 'Webcam Test', icon: 'webcam', color: '#3e63dd', live: true,
    short: 'Check your camera, its resolution and frame rate.',
    title: 'Webcam Test – Check Your Camera Online Free',
    metaDescription: 'Test your webcam online for free. See your camera live, check its real resolution and frame rate, switch cameras and take a photo. Nothing is recorded or uploaded.',
    h1: 'Webcam Test – Check Your Camera Online',
    intro: 'See if your webcam works before a video call, interview or online class. The test shows your live picture, the real resolution (720p, 1080p, 4K) and frame rate your camera delivers, lets you switch between cameras and take a photo. The video stays on your device — nothing is recorded or uploaded.',
    howToName: 'How to test your webcam',
    steps: [
      'Click "Start webcam test" and allow camera access when your browser asks.',
      'Check the live picture — it should be sharp and smooth.',
      'Look at the resolution and frame rate, and try a higher resolution from the list.',
      'Switch cameras if you have more than one, or take a photo to save.',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'Resolution: 1280 × 720 is HD, 1920 × 1080 is Full HD and 3840 × 2160 is 4K. Many laptop cameras are 720p.',
        'Frame rate: 30 fps looks smooth for calls; 60 fps is extra smooth. Below 15 fps usually means poor lighting or a busy USB port.',
        'Camera name: shows which camera is used — handy when a virtual camera (OBS, Snap Camera) is picked by mistake.',
        '"Try resolution" asks your camera for a higher quality. If the numbers don\'t change, that is the camera\'s maximum.',
      ] },
      { h: 'Tips for a better picture', p: [
        'Face a window or a lamp so light falls on your face, not behind you. Clean the lens with a soft cloth. Put the camera at eye level. In low light, cameras lower their frame rate to get a brighter picture.',
      ] },
    ],
    trouble: [
      'Black screen: check for a privacy shutter or a camera switch/key (F8, F10 or a key with a camera icon on many laptops).',
      'Access blocked: click the camera icon in the address bar, allow the camera and reload the page.',
      'Windows: Settings → Privacy & security → Camera — allow apps and desktop apps to use the camera.',
      'Mac: System Settings → Privacy & Security → Camera — allow your browser.',
      '"Used by another app": close Zoom, Teams, Skype or other apps using the camera.',
      'Camera not found: reconnect the USB cable, try another port, or update the camera driver in Device Manager.',
    ],
    faqs: [
      { q: 'How can I check if my webcam is working?', a: 'Click Start, allow camera access and your live picture appears. If you see yourself, the webcam works.' },
      { q: 'Is my video recorded?', a: 'No. The video is shown only on your screen and is not recorded or sent anywhere. Photos you take stay on your device until you download them.' },
      { q: 'How do I find my webcam resolution?', a: 'Start the test and look at "Resolution". Choose a higher value in "Try resolution" to see the maximum your camera supports.' },
      { q: 'Why is my webcam picture mirrored?', a: 'Mirroring makes it feel like a mirror. Untick "Mirror image" to see what others see in a call.' },
      { q: 'Can I test my phone camera?', a: 'Yes. Open this page on your phone and choose the front or back camera from the Camera list.' },
    ],
    related: ['mic-test', 'speaker-test', 'internet-speed-test'],
  },
  {
    slug: 'speaker-test', name: 'Speaker & Headphone Test', icon: 'speaker', color: '#f76b15', live: true,
    short: 'Left/right stereo check, frequency sweep and test tones.',
    title: 'Left Right Audio Test – Speaker & Headphone Test Online',
    metaDescription: 'Test your speakers and headphones online: left right stereo check, frequency sweep from 20 Hz to 20 kHz, test tones and phase test. Free, no download.',
    h1: 'Speaker & Headphone Test – Left / Right Audio Check',
    intro: 'Check that your speakers and headphones play the right sound on the right side. Click Left or Right to hear a chime on one side only, play a frequency sweep from deep bass to the highest treble, or use test tones and a phase test to find wiring problems. Works with laptop speakers, earbuds, headphones and speaker systems.',
    howToName: 'How to test left and right audio',
    steps: [
      'Turn the volume down a little and put on your headphones (L on the left ear).',
      'Click "Left" — you should hear the chime only in the left ear or speaker.',
      'Click "Right" — the chime should play only on the right.',
      'Use "Frequency sweep" to check bass and treble, and "Phase test" to check speaker wiring.',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'Left plays on the right? Your headphones are on backwards, or the speaker cables are swapped.',
        'Both sides play the same for Left and Right? Your device may be set to "mono audio" (check accessibility settings).',
        'Frequency sweep: most people hear from about 20 Hz to 15–17 kHz. Small speakers can\'t play deep bass; very high tones fade with age — both are normal.',
        'Phase test: the second sound should feel thinner or "wider" than the first. If the first sound is the thin one, one speaker is wired with + and − swapped.',
      ] },
      { h: 'Why stereo matters', p: [
        'Games, films and music place sounds on the left or right. If channels are swapped or one side is weak, you lose direction in games and music sounds wrong. A quick left/right test fixes that in seconds.',
      ] },
    ],
    trouble: [
      'No sound at all: check the volume and mute key, and that the right output device is selected (Windows: speaker icon in the taskbar; Mac: Control Centre → Sound).',
      'Sound only on one side: check the cable is fully plugged in, test another cable, and check the balance slider in sound settings.',
      'Bluetooth headphones sound bad during calls: they may switch to "headset" mode. Choose the "Stereo" or "Headphones" output instead.',
      'Mono sound: turn off "Mono audio" in Windows Settings → Accessibility → Audio, or Mac System Settings → Accessibility → Audio.',
    ],
    faqs: [
      { q: 'How do I test left and right headphones?', a: 'Put on your headphones and click Left, then Right. Each chime should play only on that side.' },
      { q: 'Is the frequency sweep safe?', a: 'Yes at normal volume. Start low — very high tones can feel unpleasant through headphones.' },
      { q: 'Can I test my car or home speakers?', a: 'Yes. Connect your phone or laptop by cable or Bluetooth and run the test.' },
      { q: 'Why can\'t I hear the highest tones?', a: 'Hearing above 15–16 kHz naturally fades with age, and small speakers may not play them. This is normal.' },
    ],
    related: ['mic-test', 'webcam-test', 'mouse-test'],
  },
  {
    slug: 'internet-speed-test', name: 'Internet Speed Test', icon: 'speed', color: '#12a594', live: true,
    short: 'Measure download, upload and ping with M-Lab servers.',
    title: 'Internet Speed Test – Check Download, Upload & Ping Free',
    metaDescription: 'Test your internet speed for free: download, upload and ping measured against the nearest M-Lab server. Works on Wi-Fi, mobile data and broadband in any country.',
    h1: 'Internet Speed Test – Download, Upload and Ping',
    intro: 'Check how fast your internet really is. The test measures download speed, upload speed and ping (latency) against the nearest server of Measurement Lab (M-Lab), an open, non-profit network of test servers used by researchers worldwide. It works on Wi-Fi, mobile data and broadband in any country.',
    howToName: 'How to test your internet speed',
    steps: [
      'Close downloads, streaming and other heavy apps for a fair result.',
      'Read and accept M-Lab\'s data policy, then click "Start speed test".',
      'Wait about 20 seconds while download and then upload are measured.',
      'Read your download, upload and ping results.',
    ],
    sections: [
      { h: 'What the results mean', list: [
        'Download (Mbps): how fast data comes to you — streaming, browsing, downloads. 25 Mbps is enough for 4K video on one screen.',
        'Upload (Mbps): how fast you send data — video calls, uploading files, live streaming. 5–10 Mbps is good for HD video calls.',
        'Ping (ms): how quickly the connection reacts. Under 30 ms is great for gaming, under 100 ms is fine for calls.',
        'Results can be lower than your plan on Wi-Fi, at busy evening hours, or on older devices.',
      ] },
      { h: 'About the test servers', p: [
        'This speed test uses M-Lab\'s ndt7 protocol and automatically picks the server nearest to you. M-Lab publishes every test result — including your IP address — as open data to help researchers understand the internet. You are asked to agree before the test starts.',
      ] },
    ],
    trouble: [
      'Slower than your plan: test with a cable instead of Wi-Fi, move closer to the router, and restart the router.',
      'Test won\'t start: turn off VPNs, firewalls or ad-blockers for this page; some office networks block test servers.',
      'Very high ping: other devices may be downloading or streaming. Pause them and test again.',
      'Results vary a lot: run the test 2–3 times at different times of day and compare.',
    ],
    faqs: [
      { q: 'How accurate is this speed test?', a: 'It measures real data transfer to the nearest M-Lab server over about 10 seconds each way, a method used by internet researchers. Results depend on your Wi-Fi, device and the time of day.' },
      { q: 'What is a good internet speed?', a: 'For one person, 10–25 Mbps download handles HD video and calls. Families streaming in 4K and gaming benefit from 100 Mbps or more.' },
      { q: 'Why is my speed test result lower than my plan?', a: 'Wi-Fi, distance from the router, older devices and busy networks all reduce speed. Test with a cable to see your full speed.' },
      { q: 'Does the speed test use mobile data?', a: 'Yes — a full test can use 50–500 MB depending on your speed. Use Wi-Fi if your data is limited.' },
      { q: 'Is my data stored?', a: 'ZentaPDF does not store your results. M-Lab publishes test results, including IP addresses, as open research data, as described in its privacy policy.' },
    ],
    related: ['webcam-test', 'mic-test', 'keyboard-test'],
  },
  // Coming next
  { slug: 'ping-test', name: 'Ping & Jitter Test', icon: 'ping', color: '#0797b9', live: false, short: 'Check latency and jitter for gaming and calls.' },
  { slug: 'what-is-my-ip', name: 'What Is My IP', icon: 'globe', color: '#8e4ec6', live: false, short: 'See your public IP address and location.' },
  { slug: 'dead-pixel-test', name: 'Dead Pixel Test', icon: 'pixel', color: '#5b6475', live: false, short: 'Find dead or stuck pixels on your screen.' },
  { slug: 'refresh-rate-test', name: 'Refresh Rate Test', icon: 'hz', color: '#d6409f', live: false, short: 'Measure your monitor\'s real Hz.' },
  { slug: 'double-click-test', name: 'Double-Click Test', icon: 'mouse', color: '#e5a000', live: false, short: 'Find a mouse that double-clicks by itself.' },
  { slug: 'touch-screen-test', name: 'Touchscreen Test', icon: 'touch', color: '#30a46c', live: false, short: 'Check multi-touch and dead zones.' },
  { slug: 'gamepad-test', name: 'Gamepad Tester', icon: 'gamepad', color: '#3e63dd', live: false, short: 'Test controller buttons, sticks and vibration.' },
  { slug: 'battery-test', name: 'Battery Info', icon: 'battery', color: '#12a594', live: false, short: 'See battery level and charging status.' },
];
export const dtBySlug = (s: string) => deviceTests.find((t) => t.slug === s);
