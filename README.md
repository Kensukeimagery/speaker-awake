# Speaker Awake

**EN** · [ภาษาไทย](#ภาษาไทย)

Stops auto-sleep speakers (made for the **Microlab Solo 29**, works with others) from going to sleep, so you don't miss the first ring of a call. It sits in the system tray and sends tiny, inaudible signals to your speakers at a chosen interval.

## Install

1. Download `SpeakerAwake-Setup-x.y.z.exe` from [Releases](../../releases/latest).
2. Run it (Windows 10/11, 64-bit). It installs per-user, no admin rights needed.
3. Pick a mode, press the big button. Closing the window keeps it running in the tray.

> Windows SmartScreen may warn because the installer isn't code-signed. Choose **More info → Run anyway**, or build it yourself (below).

## Modes

| Mode | What it plays | Good for |
|---|---|---|
| Ultrasonic pulse | 20 kHz beep, 0.6 s every 15 s | Most speakers. Inaudible to most adults. |
| Deep hum | 30 Hz swell | Amps that ignore high frequencies |
| Soft noise | Very quiet pink noise | Detectors that need "real" audio |
| Tiny tick | 12 ms click | Lowest power, may be faintly audible |
| Always on | Constant very quiet 20 kHz | Most reliable, slightly more power |
| Custom | Your own recipe | Experimenting |

Under **Fine-tune** you can change sound type, frequency, level (dB), pulse length, repeat interval and fade, per mode. **Test this mode** plays one pulse; **Audible beep** plays a 1 kHz beep so you can confirm the right output device.

Other options: choose the output device, start with Windows (hidden in the tray), and an "only during these hours" schedule (overnight ranges work).

## Tuning for your speakers

There is no way to read a speaker's sleep timer, so settings are found by trial:

1. Start with *Ultrasonic pulse*. Let the speakers go quiet for longer than their sleep delay and see if they still sleep.
2. Still sleeping? Shorten **Repeat every**, then raise **Level** by 3–6 dB.
3. Still no luck? Try *Deep hum* or *Soft noise*, then *Always on*.
4. Keep the Windows volume (and the app's volume in the mixer) above about 20 %: the pulse is scaled by it.

Notes: the pulse is real audio, so very sensitive speakers may emit a faint hiss. Pets can hear 20 kHz. Frequencies near 20 kHz need the sound card at 44.1 kHz or higher (the app warns you otherwise).

## Build from source

Needs Node.js 20+ (and Python + Pillow only to regenerate icons).

```bash
npm install
npm test        # signal-generation unit tests
npm start       # run in development
npm run dist    # builds dist/SpeakerAwake-Setup-<version>.exe
```

Tip: building the installer from a very deep folder path can fail inside NSIS. Use a short path such as `C:\dev\speaker-awake`.

To publish a release: `git tag v1.0.0 && git push --tags`. The workflow in `.github/workflows/release.yml` builds the installer and attaches it to the release.

## License

MIT

---

# ภาษาไทย

โปรแกรมกันลำโพงที่มีระบบ auto-sleep (ทำมาสำหรับ **Microlab Solo 29** แต่ใช้กับรุ่นอื่นได้) ไม่ให้เข้าสู่โหมดหลับ จะได้ไม่พลาดสายโทรเข้า โปรแกรมอยู่ที่ถาดระบบ (system tray) และส่งสัญญาณเสียงเบามากที่ไม่ได้ยินไปยังลำโพงเป็นช่วงๆ

## ติดตั้ง

1. ดาวน์โหลด `SpeakerAwake-Setup-x.y.z.exe` จากหน้า [Releases](../../releases/latest)
2. ดับเบิลคลิกเพื่อติดตั้ง (Windows 10/11 แบบ 64 บิต ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ)
3. เลือกโหมด แล้วกดปุ่มกลมใหญ่ ปิดหน้าต่างแล้วโปรแกรมยังทำงานต่อที่ถาดระบบ

> Windows SmartScreen อาจเตือน เพราะตัวติดตั้งยังไม่ได้เซ็นรับรอง กด **ข้อมูลเพิ่มเติม → เรียกใช้อยู่ดี** หรือสร้างจากซอร์สโค้ดเอง (ดูด้านบน)

## โหมด

- **พัลส์อัลตราโซนิก** – บี๊บ 20 kHz 0.6 วินาที ทุก 15 วินาที เหมาะกับลำโพงส่วนใหญ่ ผู้ใหญ่ส่วนใหญ่ไม่ได้ยิน
- **ฮัมทุ้มต่ำ** – เสียงทุ้ม 30 Hz สำหรับแอมป์ที่ไม่ตอบสนองความถี่สูง
- **นอยส์เบาๆ** – พิงก์นอยส์ระดับต่ำมาก สำหรับตัวตรวจจับที่ต้องการเสียงจริง
- **คลิกเล็กๆ** – คลิก 12 มิลลิวินาที ประหยัดไฟที่สุด แต่อาจได้ยินเบาๆ
- **เปิดตลอด** – สัญญาณเบามากต่อเนื่อง เชื่อถือได้ที่สุด กินไฟเพิ่มเล็กน้อย
- **กำหนดเอง** – สูตรของคุณเอง

ในส่วน **ปรับแต่งละเอียด** ปรับชนิดเสียง ความถี่ ระดับ (dB) ความยาว ช่วงเวลาส่งซ้ำ และการเฟดได้แยกตามโหมด ปุ่ม **ทดสอบโหมดนี้** เล่นหนึ่งครั้ง ส่วน **เสียงบี๊บทดสอบ** เล่นเสียง 1 kHz ให้ได้ยินจริงเพื่อเช็กว่าเลือกอุปกรณ์ถูกตัว

ตัวเลือกอื่น: เลือกอุปกรณ์เล่นเสียง เริ่มพร้อม Windows (ซ่อนไว้ที่ถาดระบบ) และตั้งเวลาทำงานเฉพาะบางช่วง (ข้ามคืนได้)

## วิธีหาค่าที่เหมาะกับลำโพงของคุณ

โปรแกรมอ่านเวลา sleep ของลำโพงไม่ได้ จึงต้องลองปรับดู:

1. เริ่มที่ *พัลส์อัลตราโซนิก* ปล่อยให้เงียบนานกว่าเวลา sleep ของลำโพงแล้วดูว่าหลับหรือไม่
2. ถ้ายังหลับ ลดค่า **ส่งซ้ำทุก** ให้สั้นลง แล้วเพิ่ม **ระดับเสียง** ทีละ 3–6 dB
3. ถ้ายังไม่ได้ผล ลอง *ฮัมทุ้มต่ำ* หรือ *นอยส์เบาๆ* แล้วค่อยลอง *เปิดตลอด*
4. อย่าตั้งเสียง Windows (และ Volume Mixer ของแอป) ต่ำกว่าประมาณ 20% เพราะสัญญาณจะเบาลงตาม

หมายเหตุ: สัญญาณเป็นเสียงจริง ลำโพงที่ไวมากอาจมีเสียงซ่าเบาๆ สัตว์เลี้ยงอาจได้ยิน 20 kHz และความถี่ใกล้ 20 kHz ต้องใช้การ์ดเสียงที่ 44.1 kHz ขึ้นไป (โปรแกรมจะเตือนถ้าไม่ถึง)

## สร้างจากซอร์สโค้ด

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
npm test
npm start
npm run dist
```

ถ้าสร้างตัวติดตั้งแล้วเจอ error จาก NSIS ให้ย้ายโปรเจกต์ไปไว้ในโฟลเดอร์ที่พาธสั้นๆ เช่น `C:\dev\speaker-awake`

## สัญญาอนุญาต

MIT
