# USTSpace 本地可见页面采集工具

版本 `2026.11.03.5-auto-wait`。完整 ZIP 包含程序、544 门课程清单（82 个 MATH、76 个 COMP）、依赖说明和 Windows 启动器。课程来自提供的 2026–27 Fall 课表，不是 USTSpace 的完整目录。

## Windows 一键运行和续采

安装 Python 3.10+，解压整个 ZIP，双击 `Start-All-Windows.bat`（或 `Start-Windows.bat`）。它会创建本地 `.venv`、安装 Playwright 和 Chromium，然后处理完整课程清单。密码只在 USTSpace 官网浏览器窗口输入。

更新旧工具时，用 ZIP 中的程序文件替换同名文件，保留原来的 `ustspace-all-snapshots.json` 和本地登录目录。启动器默认使用 `--resume`，会先复制带时间戳的 backup，再保存新结果。已采集及 unavailable 的课程会跳过，failed 的课程会重试。14 条已有记录对应 530 门待处理；原有成功页面不会丢失。损坏、未知代码或重复代码的续采文件会报错，原文件保持不变。

登录后，在弹出的浏览器里点击清单内任意一门课程，打开实际评价详情页即可，支持新标签页。工具自动检测课程并试采；终端显示 `TEST PASS` 后，立即处理完整清单的所有待采课程。无需回终端按 Enter、指定第一门课程或再启动一次。目录和搜索结果页不会触发采集。课程网址已打开但正文仍在加载时，会继续等待并保持浏览器打开，每 15 秒显示等待状态；试采开始瞬间页面切换也会重新等待，不会误报停止。

试采成功的课程会直接保存，不会在批量采集中重复。也可以打开以前已采集的课程作为测试，原有成功记录会保留。窗口请保持打开；完成后结果位于工具目录的 `ustspace-all-snapshots.json`，终端会显示保存数量。

## macOS / Linux 或手动启动

```sh
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
python3 collect.py --courses coursepilot-course-codes.json --output ustspace-all-snapshots.json --resume
```

默认课程数、分页数和加载次数均不设上限，依次处理所有待处理课程，翻页至没有下一页，加载更多/滚动至连续检查不再有新内容。重复页面会终止该课程的分页，避免循环。文字不按长度截断；仍不能保证包含网站隐藏、不可见或未正确识别的全部评价。可选 `--limit`、`--max-pages`、`--max-scrolls` 用于自行诊断，0 表示不限；默认操作间隔 4 秒。

`unavailable` 只记录并继续，无论连续多少门都不因此停止。它可能表示没有课程页面、没有评价、代码不匹配或页面结构未识别，不能仅凭此认定无人评价。HTTP 401/403/429、登录失效、验证码、robots 禁止或真实异常仍会停止并保存结果。

加 `--retry-unavailable` 可重试旧的 unavailable，同时保留成功记录。自动定位不适用时可用 `--manual` 逐门亲自打开页面。选择器和 URL 模板必须根据真实页面确定；工具不猜测私有接口，不绕过网站限制。

## 导入与验证范围

CoursePilot → Real schedules → USTSpace snapshots → Import USTSpace JSON。大文件会另外生成约 8 MB 的 part 分片，完整主文件保留。网页有 20 MB 文件及单课程文字长度限制；保留原始 JSON。导入文字仅在当前标签页内存中，刷新后清除。

已验证模拟页面中的登录→点击任意课程（含新标签页）→自动试采→全清单采集，全程不读取终端输入；同时验证分页、连续 unavailable、续采保留、访问限制停止、数据脱敏和完整 ZIP。自动试采验证的是课程可见页面读取，不代表评价完整性认证。Windows 启动器尚未在 Windows 实机执行；真实登录 USTSpace 的兼容性和评价完整性需在你本机确认。

不要上传 `.ustspace-local-session`、Cookie、密码、验证码、请求头或完整 HAR。导出 JSON 是可见页面文字，可能含课程说明或个人信息；分享前自行检查。工具移除邮箱样式文字及明显凭证行，不保证完整匿名化。
