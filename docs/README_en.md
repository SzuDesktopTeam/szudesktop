<div align="center">

# szuDesktop · Lychee Garden

**A little piece of Shenzhen University, on your desktop.**

Catch up on campus notices, take class notes, then come back from a focus session to harvest a radish.<br>
A free, open-source desktop app for SZU students, with a pixel companion to keep you company.

![platforms](https://img.shields.io/badge/Windows%2010%2F11-macOS%2013%2B%20preview-4a6fa5?style=flat-square) ![license](https://img.shields.io/badge/license-MIT-52764d?style=flat-square) ![release](https://img.shields.io/github/v/release/SzuDesktopTeam/szudesktop?include_prereleases&style=flat-square&label=release&color=a3485d)

[简体中文](../README.md) · **English**

**[Download](#download)**　·　[One-minute video](https://www.bilibili.com/video/BV1wZpA66EVd/)　·　[User guide](guide/README.md)　·　[Feedback](guide/feedback.md)

![The szuDesktop home screen, with a campus scene, today's tasks and study shortcuts](readme-home.png)

<sub>Actual app interface. A student-made, unofficial project with no affiliation with or endorsement by Shenzhen University.</sub>

</div>

## A place for classes, and the time between them

- **Start with a note.** Open a class record from the home screen, organise pages by course, and turn a sentence you want to revisit into a todo.
- **Keep campus errands together.** Browse college notices, library locations, the school calendar and venue information. Sign in on the school's own page when a service needs your account.
- **Give yourself something to come back to.** Choose Libao (荔宝), Chestnut (栗栗) or Xiaobai (小白), earn garden coins through focus sessions, then spend a break growing crops, fulfilling companion requests or playing 2048.

The garden, todos, focus timer and course notes **work offline without a school account**. Campus queries need an internet connection, and personal school services have testing limits; see [Known limitations](#known-limitations).

The app, video and linked user guides are currently in Chinese. This English README includes Chinese interface labels where you need them.

## Download

**Windows 10 / 11 (64-bit) and macOS 13 or later; no mobile app.** macOS is a preview release. Linux has the campus-network command-line tool.

**beta0.9.10 · Campus tools and a more useful home.** [Release notes and all downloads](https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.9.10). This is a prerelease; the verified scope of school services is described below.

| Your computer | Choose this | To open it |
| :-- | :-- | :-- |
| **Windows · recommended** | [Download Windows installer](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-Setup-0.9.10.exe) | Follow the installer; includes its own window, desktop companion and tray icon |
| Windows · no installation | [Download portable EXE](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-portable.exe) | Run the file; shares local records with the installer edition |
| **Mac · Apple silicon** | [Download arm64 DMG (preview)](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-mac-arm64.dmg) | Open it and drag the app into Applications |
| **Mac · Intel** | [Download x64 DMG (preview)](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-mac-x64.dmg) | Open it and drag the app into Applications |

Unsure which Mac build to choose? Check the chip or processor under **Apple menu → About This Mac**. No developer tools are needed. For the older browser-based portable edition and the command-line tool, see the [installation guide](guide/install.md).

<details>
<summary><b>Blocked on first launch? How to open and update the app</b></summary>

The packages are not code-signed, and the Mac app is not notarised by Apple, so your system may block the first launch.

- **Windows:** after confirming the file came from this repository's release page, choose **More info → Run anyway** in SmartScreen. Browser download warnings are covered in the [installation guide](guide/install.md).
- **Mac:** try opening the app once, then choose **Open Anyway** under **System Settings → Privacy & Security**. On macOS 13 / 14, you can also Control-click the app in Applications and choose **Open**.
- **Updates:** check manually under **Settings → About and updates** (设置 → 关于与更新); there is no automatic download or installation. Export the garden and todos and back up course notes separately before upgrading. On Mac, fully quit the app before replacing it.
- Release assets have matching `.sha256` files. These check download integrity, not the publisher's identity; do not assume every security warning is a false positive.

</details>

## Getting started

1. **Pick a companion.** In the welcome guide, choose **Meet my companion →** (去认识我的伙伴 →). Switch whenever you like; each companion keeps its own name and growth.
2. **Start your first class page.** Choose **New class record** (新开课堂记录) on the home screen. Next time, choose **Continue writing →** (继续写笔记 →). Notes save automatically on your computer.
3. **Focus for five minutes.** Choose **Start 5 minutes** (开始 5 分钟), then claim 5 garden coins and 5 growth points when the session ends. Your first radish takes about one minute to ripen; collect it under **Lychee Garden → My farm** (荔枝庭院 → 我的农田).

Sign in when you need a campus service. **Campus-network authentication and school-service sign-in are separate**, and access to one service does not grant access to another. See the [getting-started guide](guide/getting-started.md) for the full walkthrough.

## Features

### A desk for your courses

![Actual course-notes interface, with a course bookshelf, example note and page outline](readme-notes.png)

Give each course its own shelf. Start from a template, write Markdown, search your notes and navigate by the page outline. Turn a sentence into a todo for your next revision session.

Notes have a recycle bin and import/export. Todos can be dated, edited and archived. Focus sessions can run for 5, 25 or 45 minutes, or a custom duration; every completed and claimed minute earns 1 garden coin and 1 growth point. Feishu course documents can be imported with permission as read-only local copies; there is no two-way sync. [Study guide →](guide/study.md)

### Four kinds of campus errands, in one place

![Actual campus-services interface, showing the library catalogue](readme-campus.png)

| Area | What you can do | Scope |
| :-- | :-- | :-- |
| **School notices** | Browse by college, expand articles and attachments, search titles or full text | In-app reading for 17 colleges, plus Academic Affairs and the Graduate School; 18 sources use official search and pagination. Materials Science filters only loaded titles; other colleges link to their sites |
| **Academic studies** | Check the official calendar and personal timetable; query class timetables and published study programmes; import grades to calculate GPA locally | Personal services require your own permissions. Online grades do not automatically enter local GPA calculations; class timetables and study programmes still need real-account acceptance testing |
| **Campus life** | View sports venues and times, check study-space availability and dorm electricity, export study reminders | Internal services need the appropriate network. Electricity needs a locally configured endpoint and reports kWh, not a money balance; real-room readings and sports-booking submission remain unverified |
| **Library** | Search by title, author or subject; expand locations, call numbers and availability | Catalogue queries need no sign-in. Personal loans, CNKI and Wanfang open official school entry points |

Queries show their source and scope, with the original page available when reading fails. Degree progress, Innovation Leadership Lectures and personal loans are not synced locally. A study programme's requirements are not your earned credits, and a database link does not establish institutional access. [Campus services and sign-in guide →](guide/campus.md)

### A little time by the lake

![Actual Lychee Garden interface, with a companion and lakeside farm](readme-garden.png)

Libao is cheerful, Chestnut guards a cardboard box, and Xiaobai comes from Wenshan Lake. Click your companion, pat its head or offer a snack. The Windows installer and macOS app can also keep it in a corner of your desktop; drag it around or scroll to resize it.

Grow radishes, strawberries, blueberries and lychees; crops keep growing while the app is closed. Use the harvest for companion requests and garden building, or play 2048 at the companion table during a break. There are no purchases, leaderboards or online check-in requirements.

Change the view between Pixel Courtyard, Lakeside Daylight, After-rain Bookshop and Blue-hour Terrace. [Garden and companions guide →](guide/garden.md)

### When the campus network will not connect

The campus-network page separates internet connectivity, campus authentication and portal reachability, with clues about your network zone, protocol and proxy. An unknown state is not reported as online; internet access alone does not prove campus authentication succeeded.

It supports sign-in and sign-out for the teaching-zone Srun and dormitory Dr.COM services. If detection fails, enter the zone and access-point ID manually. Optional startup authentication runs at most once, with no periodic reconnection. For problems involving a proxy, router or VPN, run diagnostics first and follow the [network guide](guide/network.md).

## Known limitations

This is a pre-release project. **You can start with the local features; check personal school information against the school's own pages.**

- **On-site acceptance is incomplete.** Personal timetables, grades, class timetables and study programmes still need real-account validation, as do real-room electricity readings, sports-booking submission and some campus-network scenarios. Some macOS behaviour still needs physical-device testing.
- **Bookings and school records have limits.** Community-space bookings happen on official school pages. Sports submission is still being tested, with no automatic slot grabbing. Degree progress, lectures and personal loans currently provide official links only, without local sync, renewals or automatic course enrolment.
- **No cross-device sync.** Back up the garden and notes separately; Feishu import is read-only. There is no Linux desktop or mobile app. The experimental VPN module is excluded from default releases.

See [development status](STATUS.md#s1-1) for individual implementation and acceptance records, and [STATUS section 76](STATUS.md) for this round of campus-module evidence.

## Privacy and security

- **Records stay on your computer.** Garden data, todos and course notes live under `.szunet` in your user directory and can be exported separately. Record files and exported backups are not encrypted; keep them somewhere safe.
- **Saved credentials use system security.** Windows uses DPAPI, macOS uses Keychain, and the Linux campus-network CLI uses Secret Service. Saving is refused when secure storage is unavailable. School-window cookies stay in a separate local browser profile; closing the window does not clear them, but you can remove the saved login state.
- **No telemetry or analytics.** Campus queries contact the relevant school services. Network checks contact public connectivity-test endpoints; manual update checks contact GitHub. Diagnostic reports can be previewed and copied, and are not uploaded automatically.
- **Authentication protocols differ.** Teaching-zone Srun uses HTTPS; dormitory Dr.COM uses the school's existing HTTP protocol. The project does not offer billing bypasses or shared internet access.

Electricity queries do not reuse academic-service cookies. Room numbers and results stay in the current interface's memory. See [data, privacy and security](guide/data-and-privacy.md) for network activity, backups and deletion.

## FAQ

<details>
<summary><b>Trouble opening or quitting, moving computers, or using a school service?</b></summary>

Start with [installation and updates](guide/install.md), the [FAQ](guide/faq.md) or the [campus-network troubleshooting guide](深圳大学校园网连不上排查指南.md). Before moving computers, export the garden and todos and back up course notes separately. Neither backup transfers saved credentials or school sessions.

Still stuck? [Send feedback](guide/feedback.md) with what you were trying to do and where it stopped. You can attach a report after previewing it under **Settings → About and updates → Feedback and suggestions** (设置 → 关于与更新 → 反馈与建议). Leave out passwords, cookies and personal grades. Feedback currently uses GitHub Issues and requires a GitHub account.

</details>

## Command-line szunet

<details>
<summary><b>For campus-network access and scripts on Windows, macOS or Linux</b></summary>

Download the `szunet` binary for your system from [Releases](https://github.com/SzuDesktopTeam/szudesktop/releases). Replace `szunet` below with the actual filename, usually prefixed with `./` on macOS / Linux:

```text
szunet config set    # Save credentials interactively; password input is hidden
szunet login         # Detect the zone and sign in
szunet status        # Show the current zone and status
szunet diag          # Diagnose connection problems
szunet logout        # Sign out
```

Do not authenticate with the official client at the same time, or put passwords in shared scripts. See the [command-line guide](guide/network.md) for first-run steps and all options.

</details>

## Help make it better

Issues, suggestions and pull requests are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for builds and checks, [CHANGELOG.md](../CHANGELOG.md) for changes, and [STATUS](STATUS.md#s1-1) for unfinished work. Report security issues privately following [SECURITY.md](../SECURITY.md).

### Acknowledgements and licence

Project code uses the [MIT License](../LICENSE). Third-party components retain their own licences; full notices ship with the app in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

- [LoveSzu](https://github.com/teleostnacl/LoveSzu): factual reference for undergraduate timetable endpoints; independently implemented without copying its source.
- [SZU CLI](https://github.com/AwesomeHou/szu-cli): endpoint and parsing reference/adaptation for class timetables, study programmes and other services; MIT, Copyright (c) 2026 SZU CLI contributors.
- [tools4szu](https://github.com/MattDong123/tools4szu): used with author Matt's permission for interface research; reimplemented from endpoint facts. Its repository declares no open-source licence, and this project does not copy or redistribute its code.
- [SZU-login](https://github.com/Sleepstars/SZU-login): source of the Srun xEncode derivative implementation; original copyright notices remain in [LICENSE](../LICENSE).
- [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font): TakWolf, SIL OFL 1.1; [Three.js](https://www.npmjs.com/package/three/v/0.180.0): MIT; [Sakura Crossing](https://github.com/Kenton-GMI/sakura-crossing/tree/de01898e89c7f6ab3fad93fa802f0f5ac66fbd81): Kenton Wang's toon-rendering modules, MIT; [2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc): Gabriele Cirulli's movement and merging rules, MIT.
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) and [FZU Helper](https://github.com/west2-online/fzuhelper-app): references for visual hierarchy and campus-service organisation. Electron and Chromium licences remain in the installation directory.

Pingu and Skipper from *Madagascar* are fan pixel-art depictions drawn for this project. Character rights remain with their respective owners; this project's MIT licence does not cover those characters or imply official permission or endorsement. The experimental VPN module's third-party provenance and permissions remain under review, and it is excluded from default release builds.
